import { Category, Prisma, TxType } from '@prisma/client';
import { prisma } from '../config/prisma';
import { LIMITS } from '../config/limits';
import { ApiError, ERROR_CODES } from '../utils/ApiError';
import {
  CreateCategoryInput,
  UpdateCategoryInput,
  CategoryListQuery
} from '../validators/category.schema';

export interface CategoryWithUsage {
  id: string;
  name: string;
  type: TxType;
  color: string;
  icon: string;
  isArchived: boolean;
  isDefault: boolean;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  usage: {
    transactions: number;
    budgets: number;
    recurringRules: number;
    children: number;
  };
  canDelete: boolean;
}

export interface DeleteCategoryResult {
  deleted: true;
  reassigned: {
    transactions: number;
    recurringRules: number;
    budgetsMoved: number;
    budgetsMerged: number;
  };
}

/**
 * Validates category parent relationships.
 * Enforces same user, same type, unarchived, and maximum depth of 2 (parent cannot itself have a parent).
 */
async function assertValidParent(
  client: Prisma.TransactionClient | typeof prisma,
  userId: string,
  parentId: string,
  expectedType: TxType
): Promise<Category> {
  const parent = await client.category.findFirst({
    where: { id: parentId, userId }
  });

  if (!parent) {
    throw ApiError.notFound(ERROR_CODES.CATEGORY_NOT_FOUND, 'Parent category not found');
  }

  if (parent.type !== expectedType) {
    throw ApiError.badRequest(
      ERROR_CODES.INVALID_PARENT,
      'Parent category must have the same transaction type'
    );
  }

  if (parent.parentId !== null) {
    throw ApiError.badRequest(
      ERROR_CODES.INVALID_PARENT,
      'Parent category cannot be a subcategory (maximum hierarchy depth is 2)'
    );
  }

  if (parent.isArchived) {
    throw ApiError.badRequest(
      ERROR_CODES.INVALID_PARENT,
      'Parent category is archived and cannot receive new subcategories'
    );
  }

  return parent;
}

/**
 * Exported for module B2 to validate categories before recording transactions/budgets/rules.
 */
export async function assertCategoryUsable(
  client: Prisma.TransactionClient | typeof prisma,
  userId: string,
  categoryId: string,
  expectedType: TxType
): Promise<Category> {
  const cat = await client.category.findFirst({
    where: { id: categoryId, userId }
  });

  if (!cat) {
    throw ApiError.notFound(ERROR_CODES.CATEGORY_NOT_FOUND, 'Category not found');
  }

  if (cat.type !== expectedType) {
    throw ApiError.badRequest(
      ERROR_CODES.VALIDATION_ERROR,
      `Category type mismatch; expected ${expectedType} but category is ${cat.type}`
    );
  }

  if (cat.isArchived) {
    throw ApiError.badRequest(
      ERROR_CODES.VALIDATION_ERROR,
      'Archived category cannot be used for new operations'
    );
  }

  return cat;
}

export async function list(
  userId: string,
  filters: CategoryListQuery
): Promise<{ categories: CategoryWithUsage[]; count: number }> {
  const where: Prisma.CategoryWhereInput = {
    userId,
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.includeArchived ? {} : { isArchived: false }),
    ...(filters.q ? { name: { contains: filters.q, mode: 'insensitive' } } : {})
  };

  const categories = await prisma.category.findMany({ where });

  // Compute usage metrics in bulk across all categories to eliminate N+1 queries
  const [txGroups, budgetGroups, recurringGroups, childGroups] = await Promise.all([
    prisma.transaction.groupBy({
      by: ['categoryId'],
      where: { userId },
      _count: { _all: true }
    }),
    prisma.budget.groupBy({
      by: ['categoryId'],
      where: { userId },
      _count: { _all: true }
    }),
    prisma.recurringRule.groupBy({
      by: ['categoryId'],
      where: { userId },
      _count: { _all: true }
    }),
    prisma.category.groupBy({
      by: ['parentId'],
      where: { userId, parentId: { not: null } },
      _count: { _all: true }
    })
  ]);

  const txCountMap = new Map<string, number>(
    txGroups.map((g) => [g.categoryId, g._count._all])
  );
  const budgetCountMap = new Map<string, number>(
    budgetGroups.map((g) => [g.categoryId, g._count._all])
  );
  const recurringCountMap = new Map<string, number>(
    recurringGroups.map((g) => [g.categoryId, g._count._all])
  );
  const childCountMap = new Map<string, number>(
    childGroups
      .filter((g) => g.parentId !== null)
      .map((g) => [g.parentId as string, g._count._all])
  );

  const mapped: CategoryWithUsage[] = categories.map((cat) => {
    const transactions = txCountMap.get(cat.id) ?? 0;
    const budgets = budgetCountMap.get(cat.id) ?? 0;
    const recurringRules = recurringCountMap.get(cat.id) ?? 0;
    const children = childCountMap.get(cat.id) ?? 0;

    return {
      id: cat.id,
      name: cat.name,
      type: cat.type,
      color: cat.color,
      icon: cat.icon,
      isArchived: cat.isArchived,
      isDefault: cat.isDefault,
      parentId: cat.parentId,
      createdAt: cat.createdAt,
      updatedAt: cat.updatedAt,
      usage: {
        transactions,
        budgets,
        recurringRules,
        children
      },
      canDelete: transactions + recurringRules === 0
    };
  });

  // Sort by type, then name using localeCompare
  mapped.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type.localeCompare(b.type);
    }
    return a.name.localeCompare(b.name);
  });

  return { categories: mapped, count: mapped.length };
}

export async function create(
  userId: string,
  input: CreateCategoryInput
): Promise<CategoryWithUsage> {
  const currentCount = await prisma.category.count({ where: { userId } });
  if (currentCount >= LIMITS.CATEGORY.MAX_PER_USER) {
    throw ApiError.conflict(
      ERROR_CODES.CATEGORY_LIMIT_REACHED,
      `Maximum category limit of ${LIMITS.CATEGORY.MAX_PER_USER} reached`
    );
  }

  // Case-insensitive uniqueness check within (userId, type)
  const existingName = await prisma.category.findFirst({
    where: {
      userId,
      type: input.type,
      name: { equals: input.name, mode: 'insensitive' }
    }
  });

  if (existingName) {
    throw ApiError.conflict(
      ERROR_CODES.CATEGORY_NAME_TAKEN,
      'A category with this name already exists for this type'
    );
  }

  if (input.parentId) {
    await assertValidParent(prisma, userId, input.parentId, input.type);
  }

  try {
    const created = await prisma.category.create({
      data: {
        userId,
        name: input.name,
        type: input.type,
        ...(input.color ? { color: input.color } : {}),
        ...(input.icon ? { icon: input.icon } : {}),
        parentId: input.parentId || null
      }
    });

    return {
      id: created.id,
      name: created.name,
      type: created.type,
      color: created.color,
      icon: created.icon,
      isArchived: created.isArchived,
      isDefault: created.isDefault,
      parentId: created.parentId,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
      usage: {
        transactions: 0,
        budgets: 0,
        recurringRules: 0,
        children: 0
      },
      canDelete: true
    };
  } catch (err: unknown) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw ApiError.conflict(
        ERROR_CODES.CATEGORY_NAME_TAKEN,
        'A category with this name already exists for this type'
      );
    }
    throw err;
  }
}

export async function update(
  userId: string,
  id: string,
  input: UpdateCategoryInput
): Promise<CategoryWithUsage> {
  const existing = await prisma.category.findFirst({
    where: { id, userId }
  });

  if (!existing) {
    throw ApiError.notFound(ERROR_CODES.CATEGORY_NOT_FOUND, 'Category not found');
  }

  // Name uniqueness check excluding current category
  if (input.name && input.name.toLowerCase() !== existing.name.toLowerCase()) {
    const nameTaken = await prisma.category.findFirst({
      where: {
        userId,
        type: existing.type,
        name: { equals: input.name, mode: 'insensitive' },
        id: { not: id }
      }
    });

    if (nameTaken) {
      throw ApiError.conflict(
        ERROR_CODES.CATEGORY_NAME_TAKEN,
        'A category with this name already exists for this type'
      );
    }
  }

  // Parent hierarchy rules
  if (input.parentId !== undefined && input.parentId !== existing.parentId) {
    if (input.parentId !== null) {
      if (input.parentId === id) {
        throw ApiError.badRequest(
          ERROR_CODES.INVALID_PARENT,
          'A category cannot be its own parent'
        );
      }

      const childCount = await prisma.category.count({
        where: { parentId: id, userId }
      });
      if (childCount > 0) {
        throw ApiError.badRequest(
          ERROR_CODES.INVALID_PARENT,
          'A category with subcategories cannot become a subcategory itself'
        );
      }

      await assertValidParent(prisma, userId, input.parentId, existing.type);
    }
  }

  // Unarchiving validation: cannot unarchive a child if its parent is archived
  if (input.isArchived === false && existing.isArchived === true && existing.parentId) {
    const parent = await prisma.category.findFirst({
      where: { id: existing.parentId, userId }
    });
    if (parent?.isArchived) {
      throw ApiError.conflict(
        ERROR_CODES.PARENT_ARCHIVED,
        'Cannot unarchive category whose parent is archived'
      );
    }
  }

  let updated: Category;
  try {
    updated = await prisma.category.update({
      where: {
        id_userId_type: {
          id,
          userId,
          type: existing.type
        }
      },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.isArchived !== undefined ? { isArchived: input.isArchived } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {})
      }
    });
  } catch (err: unknown) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw ApiError.conflict(
        ERROR_CODES.CATEGORY_NAME_TAKEN,
        'A category with this name already exists for this type'
      );
    }
    throw err;
  }

  const [txCount, budgetCount, recurringCount, childrenCount] = await Promise.all([
    prisma.transaction.count({ where: { categoryId: id, userId } }),
    prisma.budget.count({ where: { categoryId: id, userId } }),
    prisma.recurringRule.count({ where: { categoryId: id, userId } }),
    prisma.category.count({ where: { parentId: id, userId } })
  ]);

  return {
    id: updated.id,
    name: updated.name,
    type: updated.type,
    color: updated.color,
    icon: updated.icon,
    isArchived: updated.isArchived,
    isDefault: updated.isDefault,
    parentId: updated.parentId,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
    usage: {
      transactions: txCount,
      budgets: budgetCount,
      recurringRules: recurringCount,
      children: childrenCount
    },
    canDelete: txCount + recurringCount === 0
  };
}

export async function remove(
  userId: string,
  id: string,
  reassignTo?: string
): Promise<DeleteCategoryResult> {
  return prisma.$transaction(
    async (tx) => {
      // 1. Scoped lookup of source category
      const source = await tx.category.findFirst({ where: { id, userId } });
      if (!source) {
        throw ApiError.notFound(ERROR_CODES.CATEGORY_NOT_FOUND, 'Category not found');
      }

      const [txCount, recurringCount, budgetCount] = await Promise.all([
        tx.transaction.count({ where: { categoryId: id, userId } }),
        tx.recurringRule.count({ where: { categoryId: id, userId } }),
        tx.budget.count({ where: { categoryId: id, userId } })
      ]);

      // 2. Enforce reassignment requirement if referenced
      if (txCount + recurringCount > 0 && !reassignTo) {
        throw ApiError.conflict(
          ERROR_CODES.CATEGORY_IN_USE,
          'Category is in use and cannot be deleted without reassignment',
          { transactions: txCount, recurringRules: recurringCount, budgets: budgetCount }
        );
      }

      let txMoved = 0;
      let recurringMoved = 0;
      let budgetsMoved = 0;
      let budgetsMerged = 0;

      // 3. Reassign references if target provided
      if (reassignTo) {
        const target = await tx.category.findFirst({ where: { id: reassignTo, userId } });
        if (!target) {
          throw ApiError.notFound(ERROR_CODES.CATEGORY_NOT_FOUND, 'Target category not found');
        }

        if (target.id === source.id) {
          throw ApiError.badRequest(
            ERROR_CODES.INVALID_REASSIGN_TARGET,
            'Cannot reassign to the same category'
          );
        }

        if (target.type !== source.type) {
          throw ApiError.badRequest(
            ERROR_CODES.INVALID_REASSIGN_TARGET,
            'Target category must have the same transaction type'
          );
        }

        if (target.isArchived) {
          throw ApiError.badRequest(
            ERROR_CODES.INVALID_REASSIGN_TARGET,
            'Cannot reassign to an archived category'
          );
        }

        const txRes = await tx.transaction.updateMany({
          where: { categoryId: id, userId },
          data: { categoryId: target.id }
        });
        txMoved = txRes.count;

        const ruleRes = await tx.recurringRule.updateMany({
          where: { categoryId: id, userId },
          data: { categoryId: target.id }
        });
        recurringMoved = ruleRes.count;

        // Merge source budgets into target category
        const sourceBudgets = await tx.budget.findMany({
          where: { categoryId: id, userId }
        });

        for (const sb of sourceBudgets) {
          const targetBudget = await tx.budget.findUnique({
            where: {
              userId_categoryId_month_year: {
                userId,
                categoryId: target.id,
                month: sb.month,
                year: sb.year
              }
            }
          });

          if (targetBudget) {
            await tx.budget.update({
              where: { id: targetBudget.id },
              data: { amount: { increment: sb.amount } }
            });
            await tx.budget.delete({ where: { id: sb.id } });
            budgetsMerged++;
          } else {
            await tx.budget.update({
              where: { id: sb.id },
              data: { categoryId: target.id }
            });
            budgetsMoved++;
          }
        }
      }

      // 4. Promote child categories to top-level
      await tx.category.updateMany({
        where: { parentId: id, userId },
        data: { parentId: null }
      });

      // 5. Clean up any remaining budgets belonging to this category
      await tx.budget.deleteMany({
        where: { categoryId: id, userId }
      });

      // 6. Delete source category
      try {
        await tx.category.delete({
          where: {
            id_userId_type: {
              id,
              userId,
              type: source.type
            }
          }
        });
      } catch (err: unknown) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2003'
        ) {
          throw ApiError.conflict(
            ERROR_CODES.CATEGORY_IN_USE,
            'Category is in use and cannot be deleted'
          );
        }
        throw err;
      }

      return {
        deleted: true,
        reassigned: {
          transactions: txMoved,
          recurringRules: recurringMoved,
          budgetsMoved,
          budgetsMerged
        }
      };
    },
    { timeout: LIMITS.CATEGORY.REMOVAL_TRANSACTION_TIMEOUT_MS }
  );
}
