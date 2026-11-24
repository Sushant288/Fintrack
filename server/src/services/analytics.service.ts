import { Prisma, TxType } from '@prisma/client';
import { LIMITS } from '../config/limits';
import { prisma } from '../config/prisma';
import {
  BudgetVsActualQuery,
  CategoryBreakdownQuery,
  SummaryQuery,
  TrendQuery
} from '../validators/analytics.schema';
import {
  addDays,
  diffDays,
  eachDay,
  eachMonth,
  eachWeekStart,
  formatYmd,
  monthRange,
  parseYmd,
  todayInTimeZone,
  weekStart
} from '../utils/dates';
import {
  formatMoney,
  percentChange,
  percentOf,
  savingsRate,
  sumMoney
} from '../utils/money';
import { previousPeriod, resolveRange } from '../utils/range';
import { loadAlertPrefs } from './alert.service';

export class AnalyticsService {
  /**
   * Retrieves high-level cashflow totals and comparative metrics for a user.
   */
  static async getSummary(userId: string, query: SummaryQuery) {
    const prefs = await loadAlertPrefs(prisma, userId);
    const range = resolveRange(query, prefs.timezone);
    const prev = previousPeriod(range.from, range.to);

    const fromDate = parseYmd(range.from);
    const toDate = parseYmd(range.to);
    const prevFromDate = parseYmd(prev.from);
    const prevToDate = parseYmd(prev.to);

    const [curGroups, prevGroups, curTxCount, topCats] = await Promise.all([
      prisma.transaction.groupBy({
        by: ['type'],
        _sum: { amount: true },
        where: {
          userId,
          date: { gte: fromDate, lte: toDate }
        }
      }),
      prisma.transaction.groupBy({
        by: ['type'],
        _sum: { amount: true },
        where: {
          userId,
          date: { gte: prevFromDate, lte: prevToDate }
        }
      }),
      prisma.transaction.count({
        where: {
          userId,
          date: { gte: fromDate, lte: toDate }
        }
      }),
      prisma.transaction.groupBy({
        by: ['categoryId'],
        _sum: { amount: true },
        where: {
          userId,
          type: TxType.EXPENSE,
          date: { gte: fromDate, lte: toDate }
        },
        orderBy: {
          _sum: { amount: 'desc' }
        },
        take: LIMITS.ANALYTICS.TOP_CATEGORIES_LIMIT
      })
    ]);

    // Current sums
    let curIncome = new Prisma.Decimal(0);
    let curExpense = new Prisma.Decimal(0);
    for (const g of curGroups) {
      if (g.type === TxType.INCOME && g._sum.amount) curIncome = g._sum.amount;
      if (g.type === TxType.EXPENSE && g._sum.amount) curExpense = g._sum.amount;
    }
    const curNet = curIncome.sub(curExpense);

    // Previous sums
    let prevIncome = new Prisma.Decimal(0);
    let prevExpense = new Prisma.Decimal(0);
    for (const g of prevGroups) {
      if (g.type === TxType.INCOME && g._sum.amount) prevIncome = g._sum.amount;
      if (g.type === TxType.EXPENSE && g._sum.amount) prevExpense = g._sum.amount;
    }
    const prevNet = prevIncome.sub(prevExpense);

    // Fetch category names for top categories
    const topCatIds = topCats.map((c) => c.categoryId);
    const catRecords = await prisma.category.findMany({
      where: { id: { in: topCatIds } },
      select: { id: true, name: true, color: true, icon: true }
    });
    const catMap = new Map(catRecords.map((c) => [c.id, c]));

    const topExpenseCategories = topCats.map((c) => {
      const cat = catMap.get(c.categoryId);
      const amt = c._sum.amount ?? new Prisma.Decimal(0);
      const pct = percentOf(amt, curExpense).toNumber();
      return {
        id: c.categoryId,
        name: cat?.name ?? 'Unknown',
        color: cat?.color ?? '#64748b',
        icon: cat?.icon ?? 'folder',
        amount: formatMoney(amt),
        percentage: pct
      };
    });

    return {
      period: { from: range.from, to: range.to },
      previousPeriod: { from: prev.from, to: prev.to },
      income: {
        current: formatMoney(curIncome),
        previous: formatMoney(prevIncome),
        changePct: percentChange(curIncome, prevIncome)
      },
      expense: {
        current: formatMoney(curExpense),
        previous: formatMoney(prevExpense),
        changePct: percentChange(curExpense, prevExpense)
      },
      net: {
        current: formatMoney(curNet),
        previous: formatMoney(prevNet),
        changePct: percentChange(curNet, prevNet)
      },
      savingsRate: {
        current: savingsRate(curIncome, curExpense),
        previous: savingsRate(prevIncome, prevExpense)
      },
      transactionsCount: curTxCount,
      topExpenseCategories
    };
  }

  /**
   * Retrieves category spending/income breakdown with percentage contributions.
   */
  static async getCategoryBreakdown(userId: string, query: CategoryBreakdownQuery) {
    const prefs = await loadAlertPrefs(prisma, userId);
    const range = resolveRange(query, prefs.timezone);
    const fromDate = parseYmd(range.from);
    const toDate = parseYmd(range.to);
    const type = query.type ?? TxType.EXPENSE;

    const [groups, totalSum] = await Promise.all([
      prisma.transaction.groupBy({
        by: ['categoryId'],
        _sum: { amount: true },
        _count: { id: true },
        where: {
          userId,
          type,
          date: { gte: fromDate, lte: toDate }
        },
        orderBy: {
          _sum: { amount: 'desc' }
        }
      }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: {
          userId,
          type,
          date: { gte: fromDate, lte: toDate }
        }
      })
    ]);

    const total = totalSum._sum.amount ?? new Prisma.Decimal(0);
    const categoryIds = groups.map((g) => g.categoryId);

    const categories = await prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: {
        id: true,
        name: true,
        color: true,
        icon: true,
        isArchived: true
      }
    });
    const catMap = new Map(categories.map((c) => [c.id, c]));

    const items = groups.map((g) => {
      const cat = catMap.get(g.categoryId);
      const amt = g._sum.amount ?? new Prisma.Decimal(0);
      const percentage = percentOf(amt, total).toNumber();

      return {
        id: g.categoryId,
        name: cat?.name ?? 'Unknown',
        color: cat?.color ?? '#64748b',
        icon: cat?.icon ?? 'folder',
        isArchived: cat?.isArchived ?? false,
        amount: formatMoney(amt),
        count: g._count.id,
        percentage
      };
    });

    return {
      period: { from: range.from, to: range.to },
      type,
      total: formatMoney(total),
      categories: items
    };
  }

  /**
   * Retrieves chronological income/expense/net trends aggregated daily, weekly, or monthly.
   */
  static async getTrend(userId: string, query: TrendQuery) {
    const prefs = await loadAlertPrefs(prisma, userId);
    const today = todayInTimeZone(prefs.timezone);
    const interval = query.interval ?? 'monthly';

    if (interval === 'daily') {
      const days = Math.min(query.days ?? 30, LIMITS.ANALYTICS.TREND_MAX_DAYS);
      const to = query.to ?? today;
      const toDate = parseYmd(to);
      const from = query.from ?? formatYmd(addDays(toDate, -(days - 1)));
      const fromDate = parseYmd(from);

      const rows = await prisma.transaction.findMany({
        where: {
          userId,
          date: { gte: fromDate, lte: toDate }
        },
        select: {
          type: true,
          amount: true,
          date: true
        }
      });

      const dayMap = new Map<string, { income: Prisma.Decimal; expense: Prisma.Decimal }>();
      for (const d of eachDay(from, to)) {
        dayMap.set(d, { income: new Prisma.Decimal(0), expense: new Prisma.Decimal(0) });
      }

      for (const r of rows) {
        const key = formatYmd(r.date);
        const entry = dayMap.get(key);
        if (entry) {
          if (r.type === TxType.INCOME) entry.income = entry.income.add(r.amount);
          if (r.type === TxType.EXPENSE) entry.expense = entry.expense.add(r.amount);
        }
      }

      const points = Array.from(dayMap.entries()).map(([date, val]) => {
        const net = val.income.sub(val.expense);
        return {
          date,
          income: formatMoney(val.income),
          expense: formatMoney(val.expense),
          net: formatMoney(net)
        };
      });

      return {
        interval: 'daily',
        period: { from, to },
        points
      };
    }

    if (interval === 'weekly') {
      const to = query.to ?? today;
      const toDate = parseYmd(to);
      const from = query.from ?? formatYmd(addDays(toDate, -83)); // 12 weeks
      const fromDate = parseYmd(from);

      const rows = await prisma.transaction.findMany({
        where: {
          userId,
          date: { gte: fromDate, lte: toDate }
        },
        select: {
          type: true,
          amount: true,
          date: true
        }
      });

      const weekMap = new Map<string, { income: Prisma.Decimal; expense: Prisma.Decimal }>();
      for (const w of eachWeekStart(from, to)) {
        weekMap.set(w, { income: new Prisma.Decimal(0), expense: new Prisma.Decimal(0) });
      }

      for (const r of rows) {
        const dateStr = formatYmd(r.date);
        const wKey = weekStart(dateStr);
        const entry = weekMap.get(wKey);
        if (entry) {
          if (r.type === TxType.INCOME) entry.income = entry.income.add(r.amount);
          if (r.type === TxType.EXPENSE) entry.expense = entry.expense.add(r.amount);
        }
      }

      const points = Array.from(weekMap.entries()).map(([weekStarting, val]) => {
        const net = val.income.sub(val.expense);
        return {
          weekStarting,
          income: formatMoney(val.income),
          expense: formatMoney(val.expense),
          net: formatMoney(net)
        };
      });

      return {
        interval: 'weekly',
        period: { from, to },
        points
      };
    }

    // Monthly aggregation (default)
    const monthsCount = Math.min(query.months ?? 12, LIMITS.ANALYTICS.TREND_MAX_MONTHS);
    const [todayY, todayM] = today.split('-').map(Number);
    const toYm = `${todayY}-${String(todayM).padStart(2, '0')}`;

    const startDt = new Date(Date.UTC(todayY, todayM - monthsCount, 1));
    const fromYm = `${startDt.getUTCFullYear()}-${String(startDt.getUTCMonth() + 1).padStart(2, '0')}`;

    const fromDate = parseYmd(`${fromYm}-01`);
    const toDate = parseYmd(today);

    const rows = await prisma.transaction.findMany({
      where: {
        userId,
        date: { gte: fromDate, lte: toDate }
      },
      select: {
        type: true,
        amount: true,
        date: true
      }
    });

    const monthMap = new Map<string, { income: Prisma.Decimal; expense: Prisma.Decimal }>();
    for (const m of eachMonth(fromYm, toYm)) {
      monthMap.set(m.key, { income: new Prisma.Decimal(0), expense: new Prisma.Decimal(0) });
    }

    for (const r of rows) {
      const y = r.date.getUTCFullYear();
      const m = String(r.date.getUTCMonth() + 1).padStart(2, '0');
      const key = `${y}-${m}`;
      const entry = monthMap.get(key);
      if (entry) {
        if (r.type === TxType.INCOME) entry.income = entry.income.add(r.amount);
        if (r.type === TxType.EXPENSE) entry.expense = entry.expense.add(r.amount);
      }
    }

    const points = Array.from(monthMap.entries()).map(([month, val]) => {
      const net = val.income.sub(val.expense);
      return {
        month,
        income: formatMoney(val.income),
        expense: formatMoney(val.expense),
        net: formatMoney(net),
        savingsRate: savingsRate(val.income, val.expense)
      };
    });

    return {
      interval: 'monthly',
      period: { from: `${fromYm}-01`, to: today },
      points
    };
  }

  /**
   * Retrieves budget vs actual performance comparison for a specified calendar month.
   */
  static async getBudgetVsActual(userId: string, query: BudgetVsActualQuery) {
    const prefs = await loadAlertPrefs(prisma, userId);
    const today = todayInTimeZone(prefs.timezone);
    const [todayY, todayM] = today.split('-').map(Number);

    const year = query.year ?? todayY;
    const month = query.month ?? todayM;

    const { start, endExclusive } = monthRange(year, month);

    const [budgets, spendGroups] = await Promise.all([
      prisma.budget.findMany({
        where: { userId, year, month },
        include: {
          category: {
            select: {
              id: true,
              name: true,
              color: true,
              icon: true
            }
          }
        }
      }),
      prisma.transaction.groupBy({
        by: ['categoryId'],
        _sum: { amount: true },
        where: {
          userId,
          type: TxType.EXPENSE,
          date: { gte: start, lt: endExclusive }
        }
      })
    ]);

    const spendMap = new Map<string, Prisma.Decimal>();
    for (const s of spendGroups) {
      if (s._sum.amount) spendMap.set(s.categoryId, s._sum.amount);
    }

    let totalBudgeted = new Prisma.Decimal(0);
    let totalActual = new Prisma.Decimal(0);

    const items = budgets.map((b) => {
      const actual = spendMap.get(b.categoryId) ?? new Prisma.Decimal(0);
      const budgeted = b.amount;
      const remaining = budgeted.sub(actual);
      const percentUsed = percentOf(actual, budgeted).toNumber();

      totalBudgeted = totalBudgeted.add(budgeted);
      totalActual = totalActual.add(actual);

      let status: 'OK' | 'WARNING' | 'EXCEEDED' = 'OK';
      if (actual.gt(budgeted)) {
        status = 'EXCEEDED';
      } else if (percentUsed >= 80) {
        status = 'WARNING';
      }

      return {
        budgetId: b.id,
        categoryId: b.categoryId,
        categoryName: b.category.name,
        categoryColor: b.category.color,
        categoryIcon: b.category.icon,
        budgeted: formatMoney(budgeted),
        actual: formatMoney(actual),
        remaining: formatMoney(remaining),
        percentUsed,
        status
      };
    });

    const totalRemaining = totalBudgeted.sub(totalActual);
    const overallPercentUsed = percentOf(totalActual, totalBudgeted).toNumber();

    return {
      period: { year, month },
      summary: {
        totalBudgeted: formatMoney(totalBudgeted),
        totalActual: formatMoney(totalActual),
        totalRemaining: formatMoney(totalRemaining),
        percentUsed: overallPercentUsed
      },
      budgets: items
    };
  }
}
