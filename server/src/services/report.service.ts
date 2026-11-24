import { Prisma, TxType } from '@prisma/client';
import { LIMITS } from '../config/limits';
import { prisma } from '../config/prisma';
import { ApiError, ERROR_CODES } from '../utils/ApiError';
import {
  daysInMonth,
  formatYmd,
  monthLabel,
  monthRange,
  parseYmd,
  todayInTimeZone
} from '../utils/dates';
import { formatMoney, percentOf, savingsRate } from '../utils/money';
import { toCsvLine } from '../utils/csv';
import { loadAlertPrefs } from './alert.service';
import {
  generateReportPdfBuffer,
  MonthlyReportSnapshotData,
  ReportBudgetItem,
  ReportCategoryItem
} from './pdf.service';

export class ReportService {
  /**
   * Computes the raw data structure for a monthly report snapshot.
   */
  private static async computeReportData(
    userId: string,
    year: number,
    month: number
  ): Promise<MonthlyReportSnapshotData> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, currency: true, timezone: true }
    });

    if (!user) {
      throw ApiError.notFound(ERROR_CODES.NOT_FOUND, 'User not found');
    }

    const { start, endExclusive } = monthRange(year, month);
    const lastDay = daysInMonth(year, month);
    const fromStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const toStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const label = monthLabel(year, month);

    const [curGroups, txCount, catGroups, budgets] = await Promise.all([
      prisma.transaction.groupBy({
        by: ['type'],
        _sum: { amount: true },
        where: {
          userId,
          date: { gte: start, lt: endExclusive }
        }
      }),
      prisma.transaction.count({
        where: {
          userId,
          date: { gte: start, lt: endExclusive }
        }
      }),
      prisma.transaction.groupBy({
        by: ['categoryId'],
        _sum: { amount: true },
        where: {
          userId,
          type: TxType.EXPENSE,
          date: { gte: start, lt: endExclusive }
        },
        orderBy: {
          _sum: { amount: 'desc' }
        }
      }),
      prisma.budget.findMany({
        where: { userId, year, month },
        include: {
          category: {
            select: { name: true }
          }
        }
      })
    ]);

    let income = new Prisma.Decimal(0);
    let expense = new Prisma.Decimal(0);
    for (const g of curGroups) {
      if (g.type === TxType.INCOME && g._sum.amount) income = g._sum.amount;
      if (g.type === TxType.EXPENSE && g._sum.amount) expense = g._sum.amount;
    }
    const netSavings = income.sub(expense);

    // Categories
    const categoryIds = catGroups.map((c) => c.categoryId);
    const catRecords = await prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, name: true }
    });
    const catMap = new Map(catRecords.map((c) => [c.id, c.name]));

    const categories: ReportCategoryItem[] = catGroups.map((c) => {
      const amt = c._sum.amount ?? new Prisma.Decimal(0);
      const percentage = percentOf(amt, expense).toNumber();
      return {
        id: c.categoryId,
        name: catMap.get(c.categoryId) ?? 'Unknown',
        amount: formatMoney(amt),
        percentage
      };
    });

    // Budgets
    const spendMap = new Map(catGroups.map((c) => [c.categoryId, c._sum.amount ?? new Prisma.Decimal(0)]));
    const budgetItems: ReportBudgetItem[] = budgets.map((b) => {
      const actual = spendMap.get(b.categoryId) ?? new Prisma.Decimal(0);
      const remaining = b.amount.sub(actual);
      const percentUsed = percentOf(actual, b.amount).toNumber();

      let status: 'OK' | 'WARNING' | 'EXCEEDED' = 'OK';
      if (actual.gt(b.amount)) {
        status = 'EXCEEDED';
      } else if (percentUsed >= 80) {
        status = 'WARNING';
      }

      return {
        categoryName: b.category.name,
        budgeted: formatMoney(b.amount),
        actual: formatMoney(actual),
        remaining: formatMoney(remaining),
        percentUsed,
        status
      };
    });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        currency: user.currency
      },
      period: {
        year,
        month,
        label,
        from: fromStr,
        to: toStr
      },
      summary: {
        income: formatMoney(income),
        expense: formatMoney(expense),
        netSavings: formatMoney(netSavings),
        savingsRate: savingsRate(income, expense),
        transactionsCount: txCount
      },
      categories,
      budgets: budgetItems,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Retrieves a report for a specific month. Serves cached snapshots for past months,
   * or computes live dynamic figures for the current calendar month.
   */
  static async getReport(userId: string, year: number, month: number) {
    const prefs = await loadAlertPrefs(prisma, userId);
    const today = todayInTimeZone(prefs.timezone);
    const [curY, curM] = today.split('-').map(Number);
    const isCurrent = year === curY && month === curM;

    if (isCurrent) {
      const liveData = await this.computeReportData(userId, year, month);
      return {
        id: null,
        live: true,
        ...liveData
      };
    }

    const cached = await prisma.report.findUnique({
      where: {
        userId_month_year: {
          userId,
          month,
          year
        }
      }
    });

    if (cached) {
      return {
        id: cached.id,
        live: false,
        ...(cached.dataJson as unknown as MonthlyReportSnapshotData),
        generatedAt: cached.generatedAt.toISOString()
      };
    }

    // Closed month not yet snapshotted; generate and store
    const snapshot = await this.computeReportData(userId, year, month);
    const created = await prisma.report.create({
      data: {
        userId,
        year,
        month,
        dataJson: snapshot as any
      }
    });

    return {
      id: created.id,
      live: false,
      ...snapshot,
      generatedAt: created.generatedAt.toISOString()
    };
  }

  /**
   * Forces regeneration of a past month's report snapshot.
   */
  static async regenerateReport(userId: string, year: number, month: number) {
    const prefs = await loadAlertPrefs(prisma, userId);
    const today = todayInTimeZone(prefs.timezone);
    const [curY, curM] = today.split('-').map(Number);

    if (year === curY && month === curM) {
      throw ApiError.badRequest(
        ERROR_CODES.VALIDATION_ERROR,
        'Cannot regenerate stored report for current live month'
      );
    }

    const snapshot = await this.computeReportData(userId, year, month);
    const updated = await prisma.report.upsert({
      where: {
        userId_month_year: {
          userId,
          month,
          year
        }
      },
      create: {
        userId,
        year,
        month,
        dataJson: snapshot as any
      },
      update: {
        dataJson: snapshot as any,
        generatedAt: new Date()
      }
    });

    return {
      id: updated.id,
      live: false,
      ...snapshot,
      generatedAt: updated.generatedAt.toISOString()
    };
  }

  /**
   * Lists available monthly reports (saved historical reports plus current live month).
   */
  static async listReports(userId: string, limit: number = LIMITS.REPORT.DEFAULT_HISTORICAL_MONTHS) {
    const prefs = await loadAlertPrefs(prisma, userId);
    const today = todayInTimeZone(prefs.timezone);
    const [curY, curM] = today.split('-').map(Number);

    const saved = await prisma.report.findMany({
      where: { userId },
      select: {
        id: true,
        year: true,
        month: true,
        generatedAt: true
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: limit
    });

    const items = [
      {
        id: null,
        year: curY,
        month: curM,
        label: monthLabel(curY, curM),
        live: true,
        generatedAt: null
      },
      ...saved.map((s) => ({
        id: s.id,
        year: s.year,
        month: s.month,
        label: monthLabel(s.year, s.month),
        live: false,
        generatedAt: s.generatedAt.toISOString()
      }))
    ];

    return { items };
  }

  /**
   * Generates a binary PDF buffer for a monthly report.
   */
  static async getReportPdf(userId: string, year: number, month: number): Promise<Buffer> {
    const report = await this.getReport(userId, year, month);
    return generateReportPdfBuffer(report as unknown as MonthlyReportSnapshotData);
  }

  /**
   * Generates a CSV text export summarizing the monthly report.
   */
  static async getReportCsv(userId: string, year: number, month: number): Promise<string> {
    const report = await this.getReport(userId, year, month);

    let csv = '';
    csv += toCsvLine(['FinTrack Financial Report', report.period.label]);
    csv += toCsvLine(['Period', `${report.period.from} to ${report.period.to}`]);
    csv += toCsvLine(['User', `${report.user.name} <${report.user.email}>`]);
    csv += toCsvLine(['Currency', report.user.currency]);
    csv += '\r\n';

    csv += toCsvLine(['Summary Metric', 'Amount']);
    csv += toCsvLine(['Total Income', report.summary.income]);
    csv += toCsvLine(['Total Expenses', report.summary.expense]);
    csv += toCsvLine(['Net Savings', report.summary.netSavings]);
    csv += toCsvLine(['Savings Rate', report.summary.savingsRate !== null ? `${report.summary.savingsRate}%` : 'N/A']);
    csv += toCsvLine(['Transactions Count', report.summary.transactionsCount]);
    csv += '\r\n';

    csv += toCsvLine(['Category', 'Expense Amount', 'Share Percentage']);
    for (const c of report.categories) {
      csv += toCsvLine([c.name, c.amount, `${c.percentage.toFixed(1)}%`]);
    }
    csv += '\r\n';

    csv += toCsvLine(['Budget Category', 'Budgeted', 'Actual', 'Remaining', 'Status']);
    for (const b of report.budgets) {
      csv += toCsvLine([b.categoryName, b.budgeted, b.actual, b.remaining, b.status]);
    }

    return csv;
  }
}
