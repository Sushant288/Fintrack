import { Frequency, PaymentMethod, Prisma, TxType } from '@prisma/client';
import { LIMITS } from '../config/limits';
import { prisma } from '../config/prisma';
import { ApiError, ERROR_CODES } from '../utils/ApiError';
import {
  addDays,
  addYears,
  formatYmd,
  MAX_TZ_LEAD_DAYS,
  parseYmd,
  subtractYears,
  todayInTimeZone
} from '../utils/dates';
import { formatMoney, parseMoney } from '../utils/money';
import {
  deriveRuleStatus,
  dueOccurrences,
  indexOnOrAfter,
  nextOccurrenceOnOrAfter,
  upcomingOccurrences
} from '../utils/recurrence';
import { withRetry } from '../utils/retry';
import { AlertDto, evaluateBudgetsForSpend } from './alert.service';
import { assertCategoryUsable } from './category.service';
import {
  CreateRecurringRuleInput,
  ListRecurringRulesQuery,
  UpdateRecurringRuleInput
} from '../validators/recurring.schema';
import { logger } from '../utils/logger';

export interface RuleDto {
  id: string;
  type: TxType;
  amount: string;
  description: string | null;
  paymentMethod: PaymentMethod;
  frequency: Frequency;
  category: {
    id: string;
    name: string;
    type: TxType;
    color: string;
    icon: string;
    isArchived: boolean;
  };
  categoryArchived: boolean;
  startDate: string;
  endDate: string | null;
  nextRunDate: string;
  lastRunAt: Date | null;
  isActive: boolean;
  status: 'active' | 'paused' | 'completed';
  generatedCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export type ProcessOutcome =
  | { outcome: 'locked' }
  | { outcome: 'notDue' }
  | { outcome: 'blocked'; code: string; message: string }
  | { outcome: 'generated'; created: number; alerts: AlertDto[]; completed: boolean };

/**
 * Maps a RecurringRule database row with category and generated count into a clean RuleDto.
 */
export function toRuleDto(row: any, generatedCount = 0): RuleDto {
  return {
    id: row.id,
    type: row.type,
    amount: formatMoney(row.amount),
    description: row.description ?? null,
    paymentMethod: row.paymentMethod,
    frequency: row.frequency,
    category: {
      id: row.category.id,
      name: row.category.name,
      type: row.category.type,
      color: row.category.color,
      icon: row.category.icon,
      isArchived: row.category.isArchived
    },
    categoryArchived: row.category.isArchived,
    startDate: formatYmd(row.startDate),
    endDate: row.endDate ? formatYmd(row.endDate) : null,
    nextRunDate: formatYmd(row.nextRunDate),
    lastRunAt: row.lastRunAt ?? null,
    isActive: row.isActive,
    status: deriveRuleStatus(row),
    generatedCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

/**
 * Validates start date bounds against the user's timezone today.
 */
function assertDateBounds(startDateYmd: string, todayYmd: string): void {
  const oldestAllowed = subtractYears(todayYmd, LIMITS.TRANSACTION.MAX_PAST_YEARS);
  if (startDateYmd < oldestAllowed) {
    throw ApiError.badRequest(
      ERROR_CODES.DATE_TOO_OLD,
      `Start date cannot be older than ${LIMITS.TRANSACTION.MAX_PAST_YEARS} years`
    );
  }

  const maxFuture = addYears(todayYmd, LIMITS.RECURRING.MAX_FUTURE_YEARS);
  if (startDateYmd > maxFuture) {
    throw ApiError.badRequest(
      ERROR_CODES.DATE_TOO_FAR_FUTURE,
      `Start date cannot be more than ${LIMITS.RECURRING.MAX_FUTURE_YEARS} years in the future`
    );
  }
}

/**
 * Core transactional recurring execution primitive.
 * 
 * LOCK ORDER (to prevent deadlocks across concurrent requests):
 * 1. Rule row lock FIRST via SELECT ... FOR UPDATE [SKIP LOCKED].
 * 2. Budget row locks SECOND inside evaluateBudgetsForSpend in sorted budget ID order.
 */
export async function processLockedRule(
  tx: Prisma.TransactionClient,
  ruleId: string,
  opts?: {
    now?: Date;
    lockMode?: 'skip' | 'wait';
    maxOccurrences?: number;
  }
): Promise<ProcessOutcome> {
  const now = opts?.now ?? new Date();
  const lockMode = opts?.lockMode ?? 'wait';
  const maxOccurrences = opts?.maxOccurrences ?? LIMITS.RECURRING.MAX_OCCURRENCES_PER_RUN;

  // 1. Acquire row lock on RecurringRule
  let rows: { id: string }[];
  if (lockMode === 'skip') {
    rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "RecurringRule" WHERE id = ${ruleId} AND "isActive" = true FOR UPDATE SKIP LOCKED
    `;
  } else {
    rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "RecurringRule" WHERE id = ${ruleId} AND "isActive" = true FOR UPDATE
    `;
  }

  if (rows.length === 0) {
    return { outcome: lockMode === 'skip' ? 'locked' : 'notDue' };
  }

  // 2. Re-read the rule fresh through tx with user timezone and category
  const rule = await tx.recurringRule.findUnique({
    where: { id: ruleId },
    include: {
      user: { select: { id: true, timezone: true } },
      category: {
        select: {
          id: true,
          name: true,
          type: true,
          color: true,
          icon: true,
          isArchived: true
        }
      }
    }
  });

  if (!rule || !rule.isActive) {
    return { outcome: 'notDue' };
  }

  // 3. Evaluate due dates in user's timezone
  const todayYmd = todayInTimeZone(rule.user.timezone, now);
  const result = dueOccurrences(rule, todayYmd, maxOccurrences);

  if (result.dates.length === 0) {
    if (result.completed) {
      await tx.recurringRule.update({
        where: { id: rule.id },
        data: {
          nextRunDate: result.nextRunDate,
          isActive: false
        }
      });
    }
    return { outcome: 'notDue' };
  }

  // 4. Assert category is usable without modifying rule state if blocked
  try {
    await assertCategoryUsable(tx, rule.userId, rule.categoryId, rule.type);
  } catch (err: unknown) {
    if (
      err instanceof ApiError &&
      (err.code === ERROR_CODES.CATEGORY_ARCHIVED ||
        err.code === ERROR_CODES.CATEGORY_NOT_FOUND ||
        err.code === ERROR_CODES.CATEGORY_TYPE_MISMATCH)
    ) {
      return { outcome: 'blocked', code: err.code, message: err.message };
    }
    throw err;
  }

  // 5. Query existing transaction dates for idempotency backstop
  const existingTx = await tx.transaction.findMany({
    where: {
      recurringId: rule.id,
      date: { in: result.dates }
    },
    select: { date: true }
  });
  const existingSet = new Set(existingTx.map((t) => formatYmd(t.date)));
  const missingDates = result.dates.filter((d) => !existingSet.has(formatYmd(d)));

  // Bulk insert missing transactions with skipDuplicates
  if (missingDates.length > 0) {
    await tx.transaction.createMany({
      data: missingDates.map((date) => ({
        userId: rule.userId,
        categoryId: rule.categoryId,
        type: rule.type,
        amount: rule.amount,
        date,
        description: rule.description,
        paymentMethod: rule.paymentMethod,
        recurringId: rule.id
      })),
      skipDuplicates: true
    });
  }

  // 6. Update rule: advance nextRunDate, lastRunAt, and deactivate if completed
  await tx.recurringRule.update({
    where: { id: rule.id },
    data: {
      nextRunDate: result.nextRunDate,
      lastRunAt: now,
      ...(result.completed ? { isActive: false } : {})
    }
  });

  // 7. Evaluate budget spend alerts if transactions were generated for an EXPENSE rule
  let alerts: AlertDto[] = [];
  if (rule.type === 'EXPENSE' && missingDates.length > 0) {
    alerts = await evaluateBudgetsForSpend(
      tx,
      rule.userId,
      missingDates.map((d) => ({ categoryId: rule.categoryId, date: d }))
    );
  }

  return {
    outcome: 'generated',
    created: missingDates.length,
    alerts,
    completed: result.completed
  };
}

/**
 * Wraps processLockedRule inside a top-level Prisma transaction.
 */
export async function processRule(
  ruleId: string,
  opts?: {
    now?: Date;
    lockMode?: 'skip' | 'wait';
    maxOccurrences?: number;
  }
): Promise<ProcessOutcome> {
  return prisma.$transaction(
    (tx) => processLockedRule(tx, ruleId, opts),
    {
      timeout: LIMITS.DB.TRANSACTION_TIMEOUT_MS,
      maxWait: LIMITS.DB.TRANSACTION_MAX_WAIT_MS
    }
  );
}

/**
 * Batch processor invoked by the scheduler cron and manual /recurring/process endpoint.
 */
export async function runDueRules(opts?: {
  now?: Date;
  userId?: string;
  maxOccurrencesPerRule?: number;
}): Promise<{
  scanned: number;
  rulesProcessed: number;
  generated: number;
  failed: number;
  blocked: number;
  skippedLocked: number;
  alerts: AlertDto[];
}> {
  const now = opts?.now ?? new Date();
  const utcTodayDate = parseYmd(formatYmd(now));
  const horizon = addDays(utcTodayDate, MAX_TZ_LEAD_DAYS);

  let cursor: string | undefined = undefined;
  let scanned = 0;
  let rulesProcessed = 0;
  let generated = 0;
  let failed = 0;
  let blocked = 0;
  let skippedLocked = 0;
  const allAlerts: AlertDto[] = [];

  while (true) {
    const page: { id: string; userId: string }[] = await prisma.recurringRule.findMany({
      where: {
        isActive: true,
        nextRunDate: { lte: horizon },
        ...(opts?.userId ? { userId: opts.userId } : {})
      },
      take: LIMITS.RECURRING.JOB_PAGE_SIZE,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { id: 'asc' },
      select: { id: true, userId: true }
    });

    if (page.length === 0) {
      break;
    }

    cursor = page[page.length - 1].id;
    scanned += page.length;

    for (const candidate of page) {
      try {
        const outcome = await withRetry(
          () =>
            prisma.$transaction(
              (tx) =>
                processLockedRule(tx, candidate.id, {
                  now,
                  lockMode: 'skip',
                  maxOccurrences: opts?.maxOccurrencesPerRule ?? LIMITS.RECURRING.MAX_OCCURRENCES_PER_RUN
                }),
              {
                timeout: LIMITS.DB.TRANSACTION_TIMEOUT_MS,
                maxWait: LIMITS.DB.TRANSACTION_MAX_WAIT_MS
              }
            ),
          {
            maxRetries: LIMITS.JOB.MAX_RETRIES,
            baseMs: LIMITS.JOB.RETRY_BASE_MS
          }
        );

        if (outcome.outcome === 'locked') {
          skippedLocked++;
        } else if (outcome.outcome === 'blocked') {
          blocked++;
          rulesProcessed++;
        } else if (outcome.outcome === 'notDue') {
          rulesProcessed++;
        } else if (outcome.outcome === 'generated') {
          rulesProcessed++;
          generated += outcome.created;
          if (outcome.alerts.length > 0) {
            allAlerts.push(...outcome.alerts);
          }
        }
      } catch (err: unknown) {
        failed++;
        logger.error('Failed to process recurring rule', {
          ruleId: candidate.id,
          userId: candidate.userId,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
  }

  return {
    scanned,
    rulesProcessed,
    generated,
    failed,
    blocked,
    skippedLocked,
    alerts: allAlerts
  };
}

export class RecurringService {
  static async create(
    userId: string,
    input: CreateRecurringRuleInput,
    now: Date = new Date()
  ): Promise<{ rule: RuleDto; generated: number; alerts: AlertDto[] }> {
    return prisma.$transaction(
      async (tx) => {
        // 1. Check user rule count limit
        const count = await tx.recurringRule.count({ where: { userId } });
        if (count >= LIMITS.RECURRING.MAX_RULES_PER_USER) {
          throw ApiError.conflict(
            ERROR_CODES.RULE_LIMIT_REACHED,
            `Cannot exceed ${LIMITS.RECURRING.MAX_RULES_PER_USER} recurring rules`
          );
        }

        // 2. Load user timezone and validate start date bounds
        const user = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { timezone: true }
        });
        const todayYmd = todayInTimeZone(user.timezone, now);
        assertDateBounds(input.startDate, todayYmd);

        // 3. Category usability assertion
        await assertCategoryUsable(tx, userId, input.categoryId, input.type);

        // 4. Create rule
        const created = await tx.recurringRule.create({
          data: {
            userId,
            categoryId: input.categoryId,
            type: input.type,
            amount: parseMoney(input.amount),
            frequency: input.frequency,
            startDate: parseYmd(input.startDate),
            endDate: input.endDate ? parseYmd(input.endDate) : null,
            nextRunDate: parseYmd(input.startDate),
            description: input.description ?? null,
            paymentMethod: input.paymentMethod ?? PaymentMethod.OTHER,
            isActive: true
          },
          include: {
            category: {
              select: {
                id: true,
                name: true,
                type: true,
                color: true,
                icon: true,
                isArchived: true
              }
            }
          }
        });

        // 5. If startDate is on or before today, process immediately
        let generated = 0;
        let alerts: AlertDto[] = [];
        if (input.startDate <= todayYmd) {
          const outcome = await processLockedRule(tx, created.id, {
            now,
            lockMode: 'wait',
            maxOccurrences: LIMITS.RECURRING.MAX_OCCURRENCES_PER_RUN
          });
          if (outcome.outcome === 'generated') {
            generated = outcome.created;
            alerts = outcome.alerts;
          }
        }

        // 6. Reload rule fresh to reflect generated state
        const fresh = await tx.recurringRule.findUniqueOrThrow({
          where: { id: created.id },
          include: {
            category: {
              select: {
                id: true,
                name: true,
                type: true,
                color: true,
                icon: true,
                isArchived: true
              }
            }
          }
        });

        const txCount = await tx.transaction.count({
          where: { recurringId: created.id }
        });

        return {
          rule: toRuleDto(fresh, txCount),
          generated,
          alerts
        };
      },
      {
        timeout: LIMITS.DB.TRANSACTION_TIMEOUT_MS,
        maxWait: LIMITS.DB.TRANSACTION_MAX_WAIT_MS
      }
    );
  }

  static async update(
    userId: string,
    id: string,
    input: UpdateRecurringRuleInput,
    now: Date = new Date()
  ): Promise<{ rule: RuleDto; generated: number; alerts: AlertDto[] }> {
    return prisma.$transaction(
      async (tx) => {
        // 1. Lock rule
        const rows = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "RecurringRule" WHERE id = ${id} AND "userId" = ${userId} FOR UPDATE
        `;
        if (rows.length === 0) {
          throw ApiError.notFound(ERROR_CODES.RULE_NOT_FOUND, 'Recurring rule not found');
        }

        const existing = await tx.recurringRule.findUniqueOrThrow({
          where: { id },
          include: {
            user: { select: { timezone: true } },
            category: {
              select: {
                id: true,
                name: true,
                type: true,
                color: true,
                icon: true,
                isArchived: true
              }
            }
          }
        });

        // 2. If active, process due occurrences with OLD values first
        let generated = 0;
        let alerts: AlertDto[] = [];
        if (existing.isActive) {
          const outcome = await processLockedRule(tx, id, { now, lockMode: 'wait' });
          if (outcome.outcome === 'generated') {
            generated = outcome.created;
            alerts = outcome.alerts;

            // Check if occurrences remain due after safety cap
            const interim = await tx.recurringRule.findUniqueOrThrow({
              where: { id },
              include: { user: { select: { timezone: true } } }
            });
            const today = todayInTimeZone(interim.user.timezone, now);
            const stillDue = dueOccurrences(interim, today, 1);
            if (stillDue.dates.length > 0) {
              throw ApiError.conflict(
                ERROR_CODES.CONFLICT,
                'Rule has additional due occurrences pending; process again before modifying'
              );
            }
          }
        }

        // 3. Reload rule fresh after pre-processing
        const fresh = await tx.recurringRule.findUniqueOrThrow({
          where: { id },
          include: {
            user: { select: { timezone: true } },
            category: {
              select: {
                id: true,
                name: true,
                type: true,
                color: true,
                icon: true,
                isArchived: true
              }
            }
          }
        });

        // 4. Validate category if changed
        if (input.categoryId && input.categoryId !== fresh.categoryId) {
          await assertCategoryUsable(tx, userId, input.categoryId, fresh.type);
        }

        // 5. Validate frequency changes
        let newStartDate = fresh.startDate;
        let newNextRunDate = fresh.nextRunDate;
        let newIsActive = fresh.isActive;

        if (input.frequency && input.frequency !== fresh.frequency) {
          if (deriveRuleStatus(fresh) === 'completed') {
            throw ApiError.conflict(
              ERROR_CODES.RULE_COMPLETED,
              'Cannot change frequency on a completed rule'
            );
          }
          const txCount = await tx.transaction.count({ where: { recurringId: id } });
          const hasGenerated = txCount > 0 || fresh.lastRunAt !== null;
          const anchor = hasGenerated ? fresh.nextRunDate : fresh.startDate;
          newStartDate = anchor;
          newNextRunDate = anchor;
        }

        // 6. Validate startDate changes
        if (input.startDate) {
          const txCount = await tx.transaction.count({ where: { recurringId: id } });
          if (txCount > 0 || fresh.lastRunAt !== null) {
            throw ApiError.conflict(
              ERROR_CODES.RULE_ALREADY_STARTED,
              'Start date cannot be modified after transactions have been generated'
            );
          }
          const today = todayInTimeZone(fresh.user.timezone, now);
          assertDateBounds(input.startDate, today);
          newStartDate = parseYmd(input.startDate);
          newNextRunDate = parseYmd(input.startDate);
        }

        // 7. Validate endDate changes
        let newEndDate = fresh.endDate;
        if (input.endDate !== undefined) {
          if (input.endDate !== null) {
            const endDt = parseYmd(input.endDate);
            if (endDt < newStartDate) {
              throw ApiError.badRequest(
                ERROR_CODES.VALIDATION_ERROR,
                'End date must be on or after start date'
              );
            }
            if (endDt < newNextRunDate) {
              newIsActive = false;
            }
            newEndDate = endDt;
          } else {
            newEndDate = null;
          }
        }

        // 8. Execute update
        await tx.recurringRule.update({
          where: { id },
          data: {
            ...(input.amount !== undefined ? { amount: parseMoney(input.amount) } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.paymentMethod !== undefined ? { paymentMethod: input.paymentMethod } : {}),
            ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
            ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
            startDate: newStartDate,
            endDate: newEndDate,
            nextRunDate: newNextRunDate,
            isActive: newIsActive
          }
        });

        // 9. Reload updated rule
        const updated = await tx.recurringRule.findUniqueOrThrow({
          where: { id },
          include: {
            category: {
              select: {
                id: true,
                name: true,
                type: true,
                color: true,
                icon: true,
                isArchived: true
              }
            }
          }
        });

        const txCount = await tx.transaction.count({ where: { recurringId: id } });

        return {
          rule: toRuleDto(updated, txCount),
          generated,
          alerts
        };
      },
      {
        timeout: LIMITS.DB.TRANSACTION_TIMEOUT_MS,
        maxWait: LIMITS.DB.TRANSACTION_MAX_WAIT_MS
      }
    );
  }

  static async pause(userId: string, id: string): Promise<RuleDto> {
    return prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "RecurringRule" WHERE id = ${id} AND "userId" = ${userId} FOR UPDATE
        `;
        if (rows.length === 0) {
          throw ApiError.notFound(ERROR_CODES.RULE_NOT_FOUND, 'Recurring rule not found');
        }

        const rule = await tx.recurringRule.findUniqueOrThrow({
          where: { id },
          include: {
            category: {
              select: {
                id: true,
                name: true,
                type: true,
                color: true,
                icon: true,
                isArchived: true
              }
            }
          }
        });

        if (deriveRuleStatus(rule) === 'completed') {
          throw ApiError.conflict(
            ERROR_CODES.RULE_COMPLETED,
            'Completed rule cannot be paused'
          );
        }

        if (!rule.isActive) {
          const txCount = await tx.transaction.count({ where: { recurringId: id } });
          return toRuleDto(rule, txCount);
        }

        const updated = await tx.recurringRule.update({
          where: { id },
          data: { isActive: false },
          include: {
            category: {
              select: {
                id: true,
                name: true,
                type: true,
                color: true,
                icon: true,
                isArchived: true
              }
            }
          }
        });

        const txCount = await tx.transaction.count({ where: { recurringId: id } });
        return toRuleDto(updated, txCount);
      },
      {
        timeout: LIMITS.DB.TRANSACTION_TIMEOUT_MS,
        maxWait: LIMITS.DB.TRANSACTION_MAX_WAIT_MS
      }
    );
  }

  static async resume(
    userId: string,
    id: string,
    now: Date = new Date()
  ): Promise<{ rule: RuleDto; skippedOccurrences: number }> {
    let shouldThrowCompleted = false;

    const result = await prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "RecurringRule" WHERE id = ${id} AND "userId" = ${userId} FOR UPDATE
        `;
        if (rows.length === 0) {
          throw ApiError.notFound(ERROR_CODES.RULE_NOT_FOUND, 'Recurring rule not found');
        }

        const rule = await tx.recurringRule.findUniqueOrThrow({
          where: { id },
          include: {
            user: { select: { timezone: true } },
            category: {
              select: {
                id: true,
                name: true,
                type: true,
                color: true,
                icon: true,
                isArchived: true
              }
            }
          }
        });

        if (deriveRuleStatus(rule) === 'completed') {
          throw ApiError.conflict(
            ERROR_CODES.RULE_COMPLETED,
            'Completed rule cannot be resumed'
          );
        }

        if (rule.isActive) {
          const txCount = await tx.transaction.count({ where: { recurringId: id } });
          return { rule: toRuleDto(rule, txCount), skippedOccurrences: 0 };
        }

        const today = parseYmd(todayInTimeZone(rule.user.timezone, now));
        const target = rule.nextRunDate.getTime() > today.getTime() ? rule.nextRunDate : today;
        const newNext = nextOccurrenceOnOrAfter(rule.startDate, rule.frequency, target);

        const oldIdx = indexOnOrAfter(rule.startDate, rule.frequency, rule.nextRunDate);
        const newIdx = indexOnOrAfter(rule.startDate, rule.frequency, newNext);
        const skippedOccurrences = Math.max(0, newIdx - oldIdx);

        if (rule.endDate !== null && newNext.getTime() > rule.endDate.getTime()) {
          await tx.recurringRule.update({
            where: { id },
            data: {
              nextRunDate: newNext,
              isActive: false
            }
          });
          shouldThrowCompleted = true;
          return { rule: toRuleDto(rule, 0), skippedOccurrences };
        }

        const updated = await tx.recurringRule.update({
          where: { id },
          data: {
            isActive: true,
            nextRunDate: newNext
          },
          include: {
            category: {
              select: {
                id: true,
                name: true,
                type: true,
                color: true,
                icon: true,
                isArchived: true
              }
            }
          }
        });

        const txCount = await tx.transaction.count({ where: { recurringId: id } });
        return {
          rule: toRuleDto(updated, txCount),
          skippedOccurrences
        };
      },
      {
        timeout: LIMITS.DB.TRANSACTION_TIMEOUT_MS,
        maxWait: LIMITS.DB.TRANSACTION_MAX_WAIT_MS
      }
    );

    if (shouldThrowCompleted) {
      throw ApiError.conflict(
        ERROR_CODES.RULE_COMPLETED,
        'Rule has passed its end date and cannot be resumed'
      );
    }

    return result;
  }

  static async remove(userId: string, id: string): Promise<{ deleted: true }> {
    const res = await prisma.recurringRule.deleteMany({
      where: { id, userId }
    });
    if (res.count === 0) {
      throw ApiError.notFound(ERROR_CODES.RULE_NOT_FOUND, 'Recurring rule not found');
    }
    return { deleted: true };
  }

  static async getById(userId: string, id: string): Promise<RuleDto & { upcoming: string[] }> {
    const rule = await prisma.recurringRule.findFirst({
      where: { id, userId },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
            icon: true,
            isArchived: true
          }
        }
      }
    });

    if (!rule) {
      throw ApiError.notFound(ERROR_CODES.RULE_NOT_FOUND, 'Recurring rule not found');
    }

    const txCount = await prisma.transaction.count({
      where: { recurringId: id }
    });

    const upcoming = upcomingOccurrences(rule, LIMITS.RECURRING.PREVIEW_COUNT);
    return {
      ...toRuleDto(rule, txCount),
      upcoming
    };
  }

  static async list(
    userId: string,
    query: ListRecurringRulesQuery
  ): Promise<{ items: RuleDto[]; meta: { count: number } }> {
    const rows = await prisma.recurringRule.findMany({
      where: {
        userId,
        ...(query.type ? { type: query.type } : {})
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        category: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
            icon: true,
            isArchived: true
          }
        }
      }
    });

    const ids = rows.map((r) => r.id);
    const counts = await prisma.transaction.groupBy({
      by: ['recurringId'],
      where: {
        userId,
        recurringId: { in: ids }
      },
      _count: { id: true }
    });

    const countMap = new Map<string, number>();
    for (const c of counts) {
      if (c.recurringId) {
        countMap.set(c.recurringId, c._count.id);
      }
    }

    const allDtos = rows.map((r) => toRuleDto(r, countMap.get(r.id) ?? 0));

    const filtered = query.status
      ? allDtos.filter((dto) => dto.status === query.status)
      : allDtos;

    return {
      items: filtered,
      meta: { count: filtered.length }
    };
  }
}
