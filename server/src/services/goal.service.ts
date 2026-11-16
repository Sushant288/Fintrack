import { GoalStatus, PaymentMethod, Prisma, TxType } from '@prisma/client';
import { LIMITS } from '../config/limits';
import { prisma } from '../config/prisma';
import { ApiError, ERROR_CODES } from '../utils/ApiError';
import {
  calendarMonthsUntil,
  diffDays,
  formatYmd,
  parseYmd,
  todayInTimeZone
} from '../utils/dates';
import { formatMoney, parseMoney, percentOf, sumMoney } from '../utils/money';
import { AlertDto } from './alert.service';
import { assertCategoryUsable } from './category.service';
import { createTransactionInTx } from './transaction.service';
import {
  ContributeGoalInput,
  CreateGoalInput,
  ListContributionsQuery,
  ListGoalsQuery,
  UpdateGoalInput
} from '../validators/goal.schema';

export interface GoalDto {
  id: string;
  name: string;
  targetAmount: string;
  currentAmount: string;
  remaining: string;
  percentComplete: number;
  deadline: string | null;
  daysLeft: number | null;
  requiredMonthlySaving: string | null;
  isOverdue: boolean;
  icon: string;
  color: string;
  status: GoalStatus;
  contributionCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContributionDto {
  id: string;
  goalId: string;
  kind: 'DEPOSIT' | 'WITHDRAWAL';
  amount: string;
  note: string | null;
  transactionId: string | null;
  createdAt: Date;
}

/**
 * Text template helpers. Single source of truth.
 */
export function buildStartingBalanceNote(): string {
  return 'Starting balance';
}

export function buildGoalTransactionDescription(kind: 'DEPOSIT' | 'WITHDRAWAL', goalName: string): string {
  return kind === 'DEPOSIT'
    ? `Savings goal deposit: ${goalName}`
    : `Savings goal withdrawal: ${goalName}`;
}

/**
 * Derives the lifecycle status of a savings goal based on current vs target amounts.
 */
export function deriveGoalStatus(
  current: Prisma.Decimal,
  target: Prisma.Decimal,
  isArchived: boolean
): GoalStatus {
  if (isArchived) {
    return GoalStatus.ARCHIVED;
  }
  return current.gte(target) ? GoalStatus.COMPLETED : GoalStatus.ACTIVE;
}

/**
 * Pure progress calculator exported for B3 endpoints and B4 analytics/reports.
 */
export function computeGoalProgress(
  goal: {
    targetAmount: Prisma.Decimal;
    currentAmount: Prisma.Decimal;
    deadline: Date | null;
    status: GoalStatus;
  },
  todayYmd: string
): {
  remaining: string;
  percentComplete: number;
  daysLeft: number | null;
  requiredMonthlySaving: string | null;
  isOverdue: boolean;
} {
  const zero = new Prisma.Decimal(0);
  const remainingDec = Prisma.Decimal.max(goal.targetAmount.minus(goal.currentAmount), zero);
  const percentComplete = percentOf(goal.currentAmount, goal.targetAmount).toNumber();

  if (!goal.deadline) {
    return {
      remaining: formatMoney(remainingDec),
      percentComplete,
      daysLeft: null,
      requiredMonthlySaving: null,
      isOverdue: false
    };
  }

  const deadlineYmd = formatYmd(goal.deadline);
  const daysLeft = diffDays(parseYmd(todayYmd), goal.deadline);
  const isOverdue = deadlineYmd <= todayYmd && remainingDec.gt(zero);

  if (isOverdue || goal.status === GoalStatus.COMPLETED || remainingDec.isZero()) {
    return {
      remaining: formatMoney(remainingDec),
      percentComplete,
      daysLeft,
      requiredMonthlySaving: null,
      isOverdue
    };
  }

  const months = calendarMonthsUntil(todayYmd, deadlineYmd);
  const requiredMonthlyDec = remainingDec
    .dividedBy(months)
    .toDecimalPlaces(LIMITS.MONEY.SCALE, Prisma.Decimal.ROUND_UP);

  return {
    remaining: formatMoney(remainingDec),
    percentComplete,
    daysLeft,
    requiredMonthlySaving: formatMoney(requiredMonthlyDec),
    isOverdue
  };
}

export function toGoalDto(row: any, todayYmd: string, contributionCount?: number): GoalDto {
  const progress = computeGoalProgress(
    {
      targetAmount: row.targetAmount,
      currentAmount: row.currentAmount,
      deadline: row.deadline,
      status: row.status
    },
    todayYmd
  );

  return {
    id: row.id,
    name: row.name,
    targetAmount: formatMoney(row.targetAmount),
    currentAmount: formatMoney(row.currentAmount),
    remaining: progress.remaining,
    percentComplete: progress.percentComplete,
    deadline: row.deadline ? formatYmd(row.deadline) : null,
    daysLeft: progress.daysLeft,
    requiredMonthlySaving: progress.requiredMonthlySaving,
    isOverdue: progress.isOverdue,
    icon: row.icon,
    color: row.color,
    status: row.status,
    contributionCount: row._count?.contributions ?? contributionCount ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function toContributionDto(row: any): ContributionDto {
  const dec = row.amount instanceof Prisma.Decimal ? row.amount : new Prisma.Decimal(row.amount);
  return {
    id: row.id,
    goalId: row.goalId,
    kind: dec.isNegative() ? 'WITHDRAWAL' : 'DEPOSIT',
    amount: formatMoney(dec),
    note: row.note ?? null,
    transactionId: row.transactionId ?? null,
    createdAt: row.createdAt
  };
}

/**
 * Acquires a row lock on a SavingsGoal within a transaction client.
 */
export async function lockGoal(
  tx: Prisma.TransactionClient,
  userId: string,
  id: string
): Promise<any> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "SavingsGoal" WHERE id = ${id} AND "userId" = ${userId} FOR UPDATE
  `;
  if (rows.length === 0) {
    throw ApiError.notFound(ERROR_CODES.GOAL_NOT_FOUND, 'Savings goal not found');
  }

  return tx.savingsGoal.findUniqueOrThrow({
    where: { id }
  });
}

/**
 * Exported contribution primitive composed by goalService.contribute and rollback tests.
 */
export async function contributeInTx(
  tx: Prisma.TransactionClient,
  userId: string,
  goalId: string,
  input: ContributeGoalInput,
  now: Date = new Date()
): Promise<{ contribution: ContributionDto; goal: GoalDto; alerts: AlertDto[] }> {
  // 1. Lock goal
  const goal = await lockGoal(tx, userId, goalId);

  // 2. Reject contributions on archived goals
  if (goal.status === GoalStatus.ARCHIVED) {
    throw ApiError.conflict(
      ERROR_CODES.GOAL_ARCHIVED,
      'Archived savings goal cannot receive contributions'
    );
  }

  // 3. Calculate signed delta and balance check
  const amountDec = parseMoney(input.amount);
  const isDeposit = input.kind === 'DEPOSIT';
  const delta = isDeposit ? amountDec : amountDec.negated();

  if (!isDeposit && amountDec.gt(goal.currentAmount)) {
    throw ApiError.badRequest(
      ERROR_CODES.INSUFFICIENT_GOAL_FUNDS,
      'Withdrawal amount exceeds available savings goal balance'
    );
  }

  const newCurrent = goal.currentAmount.add(delta);
  const newStatus = deriveGoalStatus(newCurrent, goal.targetAmount, false);

  // 4. Load user timezone for date calculations
  const user = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true }
  });
  const todayYmd = todayInTimeZone(user.timezone, now);

  // 5. Create linked transaction if requested
  let linkedTransactionId: string | null = null;
  let alerts: AlertDto[] = [];

  if (input.createTransaction) {
    const expectedType: TxType = isDeposit ? TxType.EXPENSE : TxType.INCOME;
    await assertCategoryUsable(tx, userId, input.categoryId!, expectedType);

    const txDate = input.date ?? todayYmd;
    const txResult = await createTransactionInTx(tx, userId, {
      type: expectedType,
      amount: input.amount,
      date: txDate,
      categoryId: input.categoryId!,
      description: buildGoalTransactionDescription(input.kind, goal.name),
      paymentMethod: input.paymentMethod ?? PaymentMethod.OTHER
    });

    linkedTransactionId = txResult.transaction.id;
    alerts = txResult.alerts;
  }

  // 6. Insert GoalContribution row
  const contribution = await tx.goalContribution.create({
    data: {
      goalId,
      userId,
      amount: delta,
      note: input.note ?? null,
      transactionId: linkedTransactionId
    }
  });

  // 7. Update goal currentAmount and status in same transaction
  const updatedGoal = await tx.savingsGoal.update({
    where: { id: goalId },
    data: {
      currentAmount: newCurrent,
      status: newStatus
    },
    include: {
      _count: {
        select: { contributions: true }
      }
    }
  });

  return {
    contribution: toContributionDto(contribution),
    goal: toGoalDto(updatedGoal, todayYmd),
    alerts
  };
}

export class GoalService {
  static async create(
    userId: string,
    input: CreateGoalInput,
    now: Date = new Date()
  ): Promise<GoalDto> {
    return prisma.$transaction(
      async (tx) => {
        // 1. Goal limit check
        const count = await tx.savingsGoal.count({ where: { userId } });
        if (count >= LIMITS.GOALS.MAX_PER_USER) {
          throw ApiError.conflict(
            ERROR_CODES.GOAL_LIMIT_REACHED,
            `Cannot exceed ${LIMITS.GOALS.MAX_PER_USER} savings goals`
          );
        }

        // 2. Load user timezone and validate deadline
        const user = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { timezone: true }
        });
        const todayYmd = todayInTimeZone(user.timezone, now);

        if (input.deadline && input.deadline <= todayYmd) {
          throw ApiError.badRequest(
            ERROR_CODES.INVALID_DEADLINE,
            'Goal deadline must be after today'
          );
        }

        const targetDec = parseMoney(input.targetAmount);
        const startingDec = input.startingAmount
          ? new Prisma.Decimal(input.startingAmount)
          : new Prisma.Decimal(0);

        if (startingDec.lt(0)) {
          throw ApiError.badRequest(
            ERROR_CODES.VALIDATION_ERROR,
            'Starting amount cannot be negative'
          );
        }

        const initialStatus = deriveGoalStatus(startingDec, targetDec, false);

        // 3. Create goal
        const created = await tx.savingsGoal.create({
          data: {
            userId,
            name: input.name,
            targetAmount: targetDec,
            currentAmount: startingDec,
            deadline: input.deadline ? parseYmd(input.deadline) : null,
            icon: input.icon ?? 'target',
            color: input.color ?? '#10b981',
            status: initialStatus
          }
        });

        // 4. If starting balance provided, create initial contribution
        let contributionCount = 0;
        if (startingDec.gt(0)) {
          await tx.goalContribution.create({
            data: {
              goalId: created.id,
              userId,
              amount: startingDec,
              note: buildStartingBalanceNote(),
              transactionId: null
            }
          });
          contributionCount = 1;
        }

        return toGoalDto(created, todayYmd, contributionCount);
      },
      {
        timeout: LIMITS.DB.TRANSACTION_TIMEOUT_MS,
        maxWait: LIMITS.DB.TRANSACTION_MAX_WAIT_MS
      }
    );
  }

  static async contribute(
    userId: string,
    goalId: string,
    input: ContributeGoalInput,
    now: Date = new Date()
  ): Promise<{ contribution: ContributionDto; goal: GoalDto; alerts: AlertDto[] }> {
    return prisma.$transaction(
      (tx) => contributeInTx(tx, userId, goalId, input, now),
      {
        timeout: LIMITS.DB.TRANSACTION_TIMEOUT_MS,
        maxWait: LIMITS.DB.TRANSACTION_MAX_WAIT_MS
      }
    );
  }

  static async update(
    userId: string,
    id: string,
    input: UpdateGoalInput,
    now: Date = new Date()
  ): Promise<GoalDto> {
    return prisma.$transaction(
      async (tx) => {
        const goal = await lockGoal(tx, userId, id);
        if (goal.status === GoalStatus.ARCHIVED) {
          throw ApiError.conflict(
            ERROR_CODES.GOAL_ARCHIVED,
            'Archived savings goal cannot be modified'
          );
        }

        const user = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { timezone: true }
        });
        const todayYmd = todayInTimeZone(user.timezone, now);

        let newDeadline: Date | null | undefined = undefined;
        if (input.deadline !== undefined) {
          if (input.deadline !== null) {
            const currentDeadlineYmd = goal.deadline ? formatYmd(goal.deadline) : null;
            if (input.deadline !== currentDeadlineYmd && input.deadline <= todayYmd) {
              throw ApiError.badRequest(
                ERROR_CODES.INVALID_DEADLINE,
                'Goal deadline must be after today'
              );
            }
            newDeadline = parseYmd(input.deadline);
          } else {
            newDeadline = null;
          }
        }

        let newStatus = goal.status;
        let newTarget: Prisma.Decimal | undefined = undefined;
        if (input.targetAmount !== undefined) {
          newTarget = parseMoney(input.targetAmount);
          newStatus = deriveGoalStatus(goal.currentAmount, newTarget, false);
        }

        const updated = await tx.savingsGoal.update({
          where: { id },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(newTarget !== undefined ? { targetAmount: newTarget } : {}),
            ...(newDeadline !== undefined ? { deadline: newDeadline } : {}),
            ...(input.icon !== undefined ? { icon: input.icon } : {}),
            ...(input.color !== undefined ? { color: input.color } : {}),
            status: newStatus
          },
          include: {
            _count: { select: { contributions: true } }
          }
        });

        return toGoalDto(updated, todayYmd);
      },
      {
        timeout: LIMITS.DB.TRANSACTION_TIMEOUT_MS,
        maxWait: LIMITS.DB.TRANSACTION_MAX_WAIT_MS
      }
    );
  }

  static async archive(userId: string, id: string, now: Date = new Date()): Promise<GoalDto> {
    return prisma.$transaction(
      async (tx) => {
        const goal = await lockGoal(tx, userId, id);
        const user = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { timezone: true }
        });
        const todayYmd = todayInTimeZone(user.timezone, now);

        if (goal.status === GoalStatus.ARCHIVED) {
          const fresh = await tx.savingsGoal.findUniqueOrThrow({
            where: { id },
            include: { _count: { select: { contributions: true } } }
          });
          return toGoalDto(fresh, todayYmd);
        }

        const updated = await tx.savingsGoal.update({
          where: { id },
          data: { status: GoalStatus.ARCHIVED },
          include: { _count: { select: { contributions: true } } }
        });

        return toGoalDto(updated, todayYmd);
      },
      {
        timeout: LIMITS.DB.TRANSACTION_TIMEOUT_MS,
        maxWait: LIMITS.DB.TRANSACTION_MAX_WAIT_MS
      }
    );
  }

  static async unarchive(userId: string, id: string, now: Date = new Date()): Promise<GoalDto> {
    return prisma.$transaction(
      async (tx) => {
        const goal = await lockGoal(tx, userId, id);
        const user = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { timezone: true }
        });
        const todayYmd = todayInTimeZone(user.timezone, now);

        if (goal.status !== GoalStatus.ARCHIVED) {
          const fresh = await tx.savingsGoal.findUniqueOrThrow({
            where: { id },
            include: { _count: { select: { contributions: true } } }
          });
          return toGoalDto(fresh, todayYmd);
        }

        const restoredStatus = deriveGoalStatus(goal.currentAmount, goal.targetAmount, false);
        const updated = await tx.savingsGoal.update({
          where: { id },
          data: { status: restoredStatus },
          include: { _count: { select: { contributions: true } } }
        });

        return toGoalDto(updated, todayYmd);
      },
      {
        timeout: LIMITS.DB.TRANSACTION_TIMEOUT_MS,
        maxWait: LIMITS.DB.TRANSACTION_MAX_WAIT_MS
      }
    );
  }

  static async remove(userId: string, id: string): Promise<{ deleted: true }> {
    const res = await prisma.savingsGoal.deleteMany({
      where: { id, userId }
    });
    if (res.count === 0) {
      throw ApiError.notFound(ERROR_CODES.GOAL_NOT_FOUND, 'Savings goal not found');
    }
    return { deleted: true };
  }

  static async getById(userId: string, id: string, now: Date = new Date()): Promise<GoalDto> {
    const [goal, user] = await Promise.all([
      prisma.savingsGoal.findFirst({
        where: { id, userId },
        include: { _count: { select: { contributions: true } } }
      }),
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { timezone: true }
      })
    ]);

    if (!goal) {
      throw ApiError.notFound(ERROR_CODES.GOAL_NOT_FOUND, 'Savings goal not found');
    }

    const todayYmd = todayInTimeZone(user.timezone, now);
    return toGoalDto(goal, todayYmd);
  }

  static async list(
    userId: string,
    query: ListGoalsQuery,
    now: Date = new Date()
  ): Promise<{
    items: GoalDto[];
    meta: { count: number; totalTarget: string; totalSaved: string };
  }> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { timezone: true }
    });
    const todayYmd = todayInTimeZone(user.timezone, now);

    const where: Prisma.SavingsGoalWhereInput = {
      userId,
      ...(query.status
        ? { status: query.status }
        : query.includeArchived
          ? {}
          : { status: { not: GoalStatus.ARCHIVED } })
    };

    const rows = await prisma.savingsGoal.findMany({
      where,
      include: {
        _count: { select: { contributions: true } }
      }
    });

    // Custom sort order: ACTIVE first, then COMPLETED, then ARCHIVED, then deadline asc (nulls last), then name
    const statusOrder: Record<GoalStatus, number> = {
      [GoalStatus.ACTIVE]: 0,
      [GoalStatus.COMPLETED]: 1,
      [GoalStatus.ARCHIVED]: 2
    };

    rows.sort((a, b) => {
      const sDiff = statusOrder[a.status] - statusOrder[b.status];
      if (sDiff !== 0) return sDiff;

      if (a.deadline && b.deadline) {
        const dDiff = a.deadline.getTime() - b.deadline.getTime();
        if (dDiff !== 0) return dDiff;
      } else if (a.deadline && !b.deadline) {
        return -1;
      } else if (!a.deadline && b.deadline) {
        return 1;
      }

      return a.name.localeCompare(b.name);
    });

    const items = rows.map((r) => toGoalDto(r, todayYmd));
    const totalTarget = sumMoney(rows.map((r) => r.targetAmount));
    const totalSaved = sumMoney(rows.map((r) => r.currentAmount));

    return {
      items,
      meta: {
        count: items.length,
        totalTarget: formatMoney(totalTarget),
        totalSaved: formatMoney(totalSaved)
      }
    };
  }

  static async listContributions(
    userId: string,
    goalId: string,
    query: ListContributionsQuery
  ): Promise<{
    items: ContributionDto[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    // 1. Verify goal ownership
    const goal = await prisma.savingsGoal.findFirst({
      where: { id: goalId, userId },
      select: { id: true }
    });
    if (!goal) {
      throw ApiError.notFound(ERROR_CODES.GOAL_NOT_FOUND, 'Savings goal not found');
    }

    // 2. Fetch paginated contributions
    const [rows, total] = await Promise.all([
      prisma.goalContribution.findMany({
        where: { goalId, userId },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
      }),
      prisma.goalContribution.count({
        where: { goalId, userId }
      })
    ]);

    return {
      items: rows.map(toContributionDto),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit) || 1
      }
    };
  }
}
