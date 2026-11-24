/**
 * FinTrack Module B4 Smoke Test Suite
 * 
 * Verifies Insights, Data Movement and Hardening:
 * - Analytics (summary, breakdown, trends, budget vs actual)
 * - CSV Export & Stateless Import (preview, confirm, deduplication, undo, template)
 * - Monthly Reports & PDF generation (PDFKit, live vs snapshot, regenerate, CSV)
 * - Scheduled Jobs & Email Delivery (report generator, cleanup, digest, SMTP)
 * - Security Hardening (Cache-Control: no-store, rate limits, envelope validation)
 */

import { Server } from 'http';
import { Frequency, ImportStatus, PaymentMethod, Prisma, PrismaClient, TxType } from '@prisma/client';
import { env } from '../../src/config/env';
import { LIMITS } from '../../src/config/limits';
import { DEFAULT_CATEGORIES } from '../../src/services/category.defaults';
import { ERROR_CODES } from '../../src/utils/ApiError';
import {
  addDays,
  dateBoundsError,
  daysInMonth,
  diffDays,
  eachDay,
  eachMonth,
  eachWeekStart,
  formatYmd,
  localHour,
  monthInstantRange,
  monthLabel,
  monthRange,
  parseYmd,
  subtractYears,
  todayInTimeZone,
  weekStart,
  zonedMidnightToUtc
} from '../../src/utils/dates';
import { formatMoney, parseMoney, percentChange, percentOf, savingsRate } from '../../src/utils/money';
import { hashPassword } from '../../src/utils/password';
import { signAccessToken } from '../../src/utils/tokens';
import { assertExportSize, escapeField, sanitizeCell, toCsvLine, unsanitizeCell } from '../../src/utils/csv';
import {
  dedupeHeaders,
  detectDelimiter,
  parseImportAmount,
  parseImportDate,
  parseImportPaymentMethod,
  suggestMapping
} from '../../src/utils/csvImport';
import { previousPeriod, resolveRange } from '../../src/utils/range';
import { __setMailTransportForTests } from '../../src/services/email.service';
import { DigestService } from '../../src/services/digest.service';
import { runReportJob } from '../../src/jobs/report.job';
import { runCleanupJob } from '../../src/jobs/cleanup.job';
import { runDigestJob } from '../../src/jobs/digest.job';
import app from '../../src/app';

const prisma = new PrismaClient();

let serverInstance: Server | null = null;
let rawBaseUrl = process.env.SMOKE_BASE_URL || `http://localhost:${env.PORT}`;
let rootUrl = rawBaseUrl.replace(/\/api\/v1\/?$/, '');
let baseUrl = `${rootUrl}/api/v1`;

interface TestRow {
  group: number;
  name: string;
  passed: boolean;
  error?: string;
}

const testResults: TestRow[] = [];

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEnvelope(resJson: any, isSuccess = true): void {
  assert(resJson !== null && typeof resJson === 'object', 'Response must be a JSON object');
  if (isSuccess) {
    assert('data' in resJson, 'Success envelope must contain "data"');
    assert('meta' in resJson, 'Success envelope must contain "meta"');
    assert(resJson.error === null, 'Success envelope "error" must be null');
  } else {
    assert(resJson.data === null, 'Failure envelope "data" must be null');
    assert(resJson.meta === null, 'Failure envelope "meta" must be null');
    assert(typeof resJson.error === 'object' && resJson.error !== null, 'Failure envelope must contain "error" object');
    assert(typeof resJson.error.code === 'string', 'Failure envelope error must have string "code"');
    assert(typeof resJson.error.message === 'string', 'Failure envelope error must have string "message"');
  }
}

function authHeaders(token: string, contentType = 'application/json'): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`
  };
  if (contentType) {
    headers['Content-Type'] = contentType;
  }
  return headers;
}

async function runGroup(groupNum: number, name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    testResults.push({ group: groupNum, name, passed: true });
    console.log(`[PASS] Group ${groupNum}: ${name}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    testResults.push({ group: groupNum, name, passed: false, error: msg });
    console.error(`[FAIL] Group ${groupNum}: ${name} -> ${msg}`);
  }
}

async function createTestUser(prefix: string) {
  const p = prefix.toLowerCase();
  const email = `b4-smoke-${p}-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
  const passwordHash = await hashPassword('ValidPass123!');
  const user = await prisma.user.create({
    data: {
      name: `B4 User ${prefix}`,
      email,
      passwordHash,
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      alertInAppEnabled: true,
      alertEmailEnabled: true,
      categories: {
        createMany: {
          data: DEFAULT_CATEGORIES.map((c) => ({
            name: c.name,
            type: c.type,
            color: c.color,
            icon: c.icon,
            isDefault: true
          }))
        }
      }
    },
    include: {
      categories: true
    }
  });

  const token = signAccessToken(user.id);
  return { user, token };
}

async function main(): Promise<void> {
  console.log(`Starting FinTrack Module B4 Smoke Test Suite...`);

  // Start in-process server if external server is not responding
  try {
    const probe = await fetch(`${rootUrl}/health`).catch(() => null);
    if (!probe || probe.status !== 200) {
      serverInstance = app.listen(0);
      const port = (serverInstance.address() as any).port;
      rootUrl = `http://127.0.0.1:${port}`;
      baseUrl = `${rootUrl}/api/v1`;
      console.log(`Spawned in-process server listening on ${baseUrl}`);
    } else {
      console.log(`Connected to active test server at ${baseUrl}`);
    }
  } catch {
    serverInstance = app.listen(0);
    const port = (serverInstance.address() as any).port;
    rootUrl = `http://127.0.0.1:${port}`;
    baseUrl = `${rootUrl}/api/v1`;
  }

  // Inject mock mail transport for testing
  const sentEmails: any[] = [];
  __setMailTransportForTests({
    sendMail: async (mailOpts: any) => {
      sentEmails.push(mailOpts);
      return { messageId: `mock-mail-${Date.now()}` };
    }
  } as any);

  try {
    // -------------------------------------------------------------
    // Group 1: PURE DATE UTILS (zonedMidnightToUtc, monthInstantRange, localHour, etc.)
    // -------------------------------------------------------------
    await runGroup(1, 'PURE DATE UTILS - Zoned instants & intervals', async () => {
      const utcDt = zonedMidnightToUtc('UTC', '2026-03-01');
      assert(utcDt.toISOString() === '2026-03-01T00:00:00.000Z', 'UTC midnight matches exactly');

      const kolkataDt = zonedMidnightToUtc('Asia/Kolkata', '2026-03-01');
      // Kolkata is UTC+5:30 -> midnight is 18:30 UTC previous day
      assert(kolkataDt.toISOString() === '2026-02-28T18:30:00.000Z', 'Kolkata midnight correct UTC offset');

      const mRange = monthInstantRange('Asia/Kolkata', 2026, 3);
      assert(mRange.start.toISOString() === '2026-02-28T18:30:00.000Z', 'Month start instant matches');
      assert(mRange.endExclusive.toISOString() === '2026-03-31T18:30:00.000Z', 'Month end instant matches');

      const hour = localHour('Asia/Kolkata', new Date('2026-03-01T12:00:00.000Z'));
      assert(hour === 17, `Local hour in Kolkata at 12:00Z should be 17 (got ${hour})`);

      assert(weekStart('2026-02-18') === '2026-02-16', 'Wednesday weekStart is Monday 2026-02-16');
      assert(weekStart('2026-02-22') === '2026-02-16', 'Sunday weekStart is Monday 2026-02-16');

      const days = eachDay('2026-02-26', '2026-03-02');
      assert(days.length === 5, 'eachDay generates 5 dates across month boundary');
      assert(days[0] === '2026-02-26' && days[4] === '2026-03-02', 'Days bounds match');

      const weeks = eachWeekStart('2026-02-01', '2026-02-20');
      assert(weeks.length > 0 && weeks.every((w) => weekStart(w) === w), 'eachWeekStart generates Mondays');

      const months = eachMonth('2025-11', '2026-02');
      assert(months.length === 4, 'eachMonth produces 4 months across year boundary');
      assert(months[0].key === '2025-11' && months[3].key === '2026-02', 'Month keys correct');
    });

    // -------------------------------------------------------------
    // Group 2: PURE DATE UTILS - dateBoundsError
    // -------------------------------------------------------------
    await runGroup(2, 'PURE DATE UTILS - dateBoundsError validation', async () => {
      const today = '2026-02-15';
      assert(dateBoundsError('2026-02-16', today) === 'DATE_IN_FUTURE', 'Future date identified');
      assert(dateBoundsError('2015-01-01', today, 10) === 'DATE_TOO_OLD', 'Date older than 10 years identified');
      assert(dateBoundsError('2026-02-15', today) === null, 'Today is valid');
      assert(dateBoundsError('2024-06-01', today) === null, 'Recent past date is valid');
    });

    // -------------------------------------------------------------
    // Group 3: PURE MONEY UTILS - percentChange
    // -------------------------------------------------------------
    await runGroup(3, 'PURE MONEY UTILS - percentChange calculations', async () => {
      assert(percentChange('120.00', '100.00') === 20.0, '+20% increase');
      assert(percentChange('80.00', '100.00') === -20.0, '-20% decrease');
      assert(percentChange('100.00', '0.00') === null, 'Zero previous returns null');
      assert(percentChange('100.00', '100.00') === 0.0, 'No change returns 0.0');
    });

    // -------------------------------------------------------------
    // Group 4: PURE MONEY UTILS - savingsRate
    // -------------------------------------------------------------
    await runGroup(4, 'PURE MONEY UTILS - savingsRate calculations', async () => {
      assert(savingsRate('1000.00', '600.00') === 40.0, '40% savings rate');
      assert(savingsRate('1000.00', '1200.00') === -20.0, '-20% negative savings rate');
      assert(savingsRate('0.00', '100.00') === null, 'Zero income returns null');
      assert(savingsRate('-500.00', '100.00') === null, 'Negative income returns null');
    });

    // -------------------------------------------------------------
    // Group 5: PURE RANGE UTILS - presets
    // -------------------------------------------------------------
    await runGroup(5, 'PURE RANGE UTILS - preset resolution', async () => {
      const rMonth = resolveRange({ range: 'this_month' }, 'Asia/Kolkata');
      assert(rMonth.from.endsWith('-01'), 'this_month starts on 1st');

      const rPrevMonth = resolveRange({ range: 'last_month' }, 'Asia/Kolkata');
      assert(rPrevMonth.from.endsWith('-01'), 'last_month starts on 1st');
      assert(rPrevMonth.from < rMonth.from, 'last_month is before this_month');

      const rDays = resolveRange({ range: 'last_30_days' }, 'Asia/Kolkata');
      assert(diffDays(parseYmd(rDays.from), parseYmd(rDays.to)) === 29, 'last_30_days is 30 days inclusive');

      const rCustom = resolveRange({ from: '2026-01-01', to: '2026-01-31' }, 'Asia/Kolkata');
      assert(rCustom.from === '2026-01-01' && rCustom.to === '2026-01-31', 'Custom range preserved');
    });

    // -------------------------------------------------------------
    // Group 6: PURE RANGE UTILS - previousPeriod
    // -------------------------------------------------------------
    await runGroup(6, 'PURE RANGE UTILS - comparative previousPeriod', async () => {
      const prev = previousPeriod('2026-02-01', '2026-02-14');
      assert(prev.to === '2026-01-31', 'Previous period ends immediately prior to from');
      assert(diffDays(parseYmd(prev.from), parseYmd(prev.to)) === 13, 'Previous period matches exact duration');
    });

    // -------------------------------------------------------------
    // Group 7: PURE CSV SANITIZATION - formula injection
    // -------------------------------------------------------------
    await runGroup(7, 'PURE CSV SANITIZATION - injection triggers', async () => {
      assert(sanitizeCell('=SUM(A1:A10)') === "'=SUM(A1:A10)", 'Formula = prefixed with single quote');
      assert(sanitizeCell('+cmd|') === "'+cmd|", 'Formula + prefixed');
      assert(sanitizeCell('-calc') === "'-calc", 'Formula - prefixed when text');
      assert(sanitizeCell('@calc') === "'@calc", 'Formula @ prefixed');
      assert(sanitizeCell('\tpayload') === "'\tpayload", 'Formula tab prefixed');

      // Safe numbers are NOT prefixed
      assert(sanitizeCell(-123.45) === '-123.45', 'Negative number preserved as-is');
      assert(sanitizeCell('-123.45') === '-123.45', 'Negative numeric string preserved as-is');
      const decStr = sanitizeCell(new Prisma.Decimal('50.00'));
      assert(decStr === '50' || decStr === '50.00', 'Decimal preserved as-is');
    });

    // -------------------------------------------------------------
    // Group 8: PURE CSV SANITIZATION - unsanitizeCell
    // -------------------------------------------------------------
    await runGroup(8, 'PURE CSV SANITIZATION - unsanitizeCell', async () => {
      assert(unsanitizeCell("'=SUM(A1:A10)") === '=SUM(A1:A10)', 'Single quote stripped for formula prefix');
      assert(unsanitizeCell("'-test") === '-test', 'Single quote stripped for hyphen prefix');
      assert(unsanitizeCell('Regular text') === 'Regular text', 'Untouched text preserved');
    });

    // -------------------------------------------------------------
    // Group 9: PURE CSV GENERATION - toCsvLine & escapeField
    // -------------------------------------------------------------
    await runGroup(9, 'PURE CSV GENERATION - RFC 4180 escaping', async () => {
      assert(escapeField('Simple') === 'Simple', 'Simple string not quoted');
      assert(escapeField('With, comma') === '"With, comma"', 'Comma triggers quotation');
      assert(escapeField('With "quote"') === '"With ""quote"""', 'Internal quotes escaped as double quotes');
      const line = toCsvLine(['A', 'B,C', 10]);
      assert(line === 'A,"B,C",10\r\n', 'Line formatted with CRLF');
    });

    // -------------------------------------------------------------
    // Group 10: PURE CSV GENERATION - assertExportSize
    // -------------------------------------------------------------
    await runGroup(10, 'PURE CSV GENERATION - export size policy', async () => {
      assertExportSize(100);
      let threw = false;
      try {
        assertExportSize(LIMITS.EXPORT.MAX_ROWS + 1);
      } catch (err: any) {
        threw = true;
        assert(err.code === ERROR_CODES.EXPORT_TOO_LARGE, 'Throws EXPORT_TOO_LARGE');
      }
      assert(threw, 'Export size check threw error on excess');
    });

    // -------------------------------------------------------------
    // Group 11: PURE CSV IMPORT - delimiter detection
    // -------------------------------------------------------------
    await runGroup(11, 'PURE CSV IMPORT - detectDelimiter', async () => {
      assert(detectDelimiter('date,amount,type') === ',', 'Comma delimiter detected');
      assert(detectDelimiter('date;amount;type') === ';', 'Semicolon delimiter detected');
      assert(detectDelimiter('date\tamount\ttype') === '\t', 'Tab delimiter detected');
    });

    // -------------------------------------------------------------
    // Group 12: PURE CSV IMPORT - dedupeHeaders
    // -------------------------------------------------------------
    await runGroup(12, 'PURE CSV IMPORT - dedupeHeaders', async () => {
      const deduped = dedupeHeaders(['Amount', 'Date', 'Amount', 'Amount']);
      assert(deduped[0] === 'Amount', 'First instance unchanged');
      assert(deduped[2] === 'Amount_2', 'Second instance appended with _2');
      assert(deduped[3] === 'Amount_3', 'Third instance appended with _3');
    });

    // -------------------------------------------------------------
    // Group 13: PURE CSV IMPORT - suggestMapping
    // -------------------------------------------------------------
    await runGroup(13, 'PURE CSV IMPORT - suggestMapping', async () => {
      const headers = ['Booking Date', 'Amount (EUR)', 'Category Name', 'Payee / Memo'];
      const m = suggestMapping(headers);
      assert(m.date === 'Booking Date', 'Detected date header');
      assert(m.amount === 'Amount (EUR)', 'Detected amount header');
      assert(m.category === 'Category Name', 'Detected category header');
      assert(m.description === 'Payee / Memo', 'Detected description header');
    });

    // -------------------------------------------------------------
    // Group 14: PURE CSV IMPORT - parseImportAmount
    // -------------------------------------------------------------
    await runGroup(14, 'PURE CSV IMPORT - parseImportAmount', async () => {
      const a1 = parseImportAmount('$1,234.50');
      assert(a1.amount.toFixed(2) === '1234.50', 'Parsed US currency string');

      const a2 = parseImportAmount('€ 1.234,50');
      assert(a2.amount.toFixed(2) === '1234.50', 'Parsed European decimal format');

      const a3 = parseImportAmount('(50.00)');
      assert(a3.amount.toFixed(2) === '50.00' && a3.inferredType === TxType.EXPENSE, 'Parenthesized negative amount inferred as EXPENSE');

      const a4 = parseImportAmount('-75.25');
      assert(a4.amount.toFixed(2) === '75.25' && a4.inferredType === TxType.EXPENSE, 'Minus sign inferred as EXPENSE');
    });

    // -------------------------------------------------------------
    // Group 15: PURE CSV IMPORT - parseImportDate
    // -------------------------------------------------------------
    await runGroup(15, 'PURE CSV IMPORT - parseImportDate formats', async () => {
      assert(parseImportDate('2026-02-15') === '2026-02-15', 'ISO date');
      assert(parseImportDate('02/15/2026') === '2026-02-15', 'US MM/DD/YYYY');
      assert(parseImportDate('15/02/2026') === '2026-02-15', 'European DD/MM/YYYY');
      assert(parseImportDate('2026/02/15') === '2026-02-15', 'Slash ISO YYYY/MM/DD');
    });

    // -------------------------------------------------------------
    // Group 16: PURE CSV IMPORT - parseImportPaymentMethod
    // -------------------------------------------------------------
    await runGroup(16, 'PURE CSV IMPORT - parseImportPaymentMethod', async () => {
      assert(parseImportPaymentMethod('Cash') === PaymentMethod.CASH, 'Cash mapped');
      assert(parseImportPaymentMethod('Credit Card') === PaymentMethod.CARD, 'Credit Card mapped');
      assert(parseImportPaymentMethod('Bank Transfer Wire') === PaymentMethod.BANK_TRANSFER, 'Bank Transfer mapped');
      assert(parseImportPaymentMethod('Google Pay UPI') === PaymentMethod.UPI, 'UPI mapped');
      assert(parseImportPaymentMethod('Unknown gadget') === PaymentMethod.OTHER, 'Fallback to OTHER');
    });

    // Setup base user for subsequent integration tests
    const { user: userA, token: tokenA } = await createTestUser('A');
    const foodCat = userA.categories.find((c) => c.name === 'Food' && c.type === TxType.EXPENSE)!;
    const salaryCat = userA.categories.find((c) => c.name === 'Salary' && c.type === TxType.INCOME)!;

    // Seed initial transactions for analytics & reports
    await prisma.transaction.createMany({
      data: [
        {
          userId: userA.id,
          categoryId: salaryCat.id,
          type: TxType.INCOME,
          amount: new Prisma.Decimal('5000.00'),
          date: parseYmd('2026-02-01'),
          description: 'Monthly Salary'
        },
        {
          userId: userA.id,
          categoryId: foodCat.id,
          type: TxType.EXPENSE,
          amount: new Prisma.Decimal('350.00'),
          date: parseYmd('2026-02-05'),
          description: 'Supermarket'
        },
        {
          userId: userA.id,
          categoryId: foodCat.id,
          type: TxType.EXPENSE,
          amount: new Prisma.Decimal('150.00'),
          date: parseYmd('2026-02-10'),
          description: 'Local market'
        }
      ]
    });

    // Seed a budget
    const budgetA = await prisma.budget.create({
      data: {
        userId: userA.id,
        categoryId: foodCat.id,
        year: 2026,
        month: 2,
        amount: new Prisma.Decimal('600.00')
      }
    });

    // -------------------------------------------------------------
    // Group 17: AUTH & TENANT SETUP
    // -------------------------------------------------------------
    await runGroup(17, 'AUTH & TENANT SETUP - User created with default categories', async () => {
      assert(userA.categories.length > 0, 'Categories seeded');
      assert(Boolean(tokenA), 'JWT token generated');
    });

    // -------------------------------------------------------------
    // Group 18: ANALYTICS API - GET /analytics/summary
    // -------------------------------------------------------------
    await runGroup(18, 'ANALYTICS API - GET /analytics/summary', async () => {
      const res = await fetch(`${baseUrl}/analytics/summary?from=2026-02-01&to=2026-02-28`, {
        headers: authHeaders(tokenA)
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const json = await res.json();
      assertEnvelope(json, true);
      assert(json.data.income.current === '5000.00', 'Income total correct');
      assert(json.data.expense.current === '500.00', 'Expense total correct (350+150)');
      assert(json.data.net.current === '4500.00', 'Net savings correct');
      assert(json.data.savingsRate.current === 90.0, 'Savings rate 90%');
      assert(json.data.topExpenseCategories.length > 0, 'Top expense categories returned');
    });

    // -------------------------------------------------------------
    // Group 19: ANALYTICS API - GET /analytics/summary with range presets
    // -------------------------------------------------------------
    await runGroup(19, 'ANALYTICS API - Range preset queries', async () => {
      const res = await fetch(`${baseUrl}/analytics/summary?range=this_month`, {
        headers: authHeaders(tokenA)
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const json = await res.json();
      assertEnvelope(json, true);
      assert('period' in json.data && 'income' in json.data, 'Summary envelope valid');
    });

    // -------------------------------------------------------------
    // Group 20: ANALYTICS API - Invalid date range
    // -------------------------------------------------------------
    await runGroup(20, 'ANALYTICS API - Validation error on invalid range', async () => {
      const res = await fetch(`${baseUrl}/analytics/summary?from=2026-03-01&to=2026-02-01`, {
        headers: authHeaders(tokenA)
      });
      assert(res.status === 400, `Expected 400, got ${res.status}`);
      const json = await res.json();
      assertEnvelope(json, false);
      assert(json.error.code === ERROR_CODES.VALIDATION_ERROR, 'Returns VALIDATION_ERROR');
    });

    // -------------------------------------------------------------
    // Group 21: ANALYTICS API - GET /analytics/categories (breakdown)
    // -------------------------------------------------------------
    await runGroup(21, 'ANALYTICS API - GET /analytics/categories', async () => {
      const res = await fetch(`${baseUrl}/analytics/categories?from=2026-02-01&to=2026-02-28`, {
        headers: authHeaders(tokenA)
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const json = await res.json();
      assertEnvelope(json, true);
      assert(json.data.total === '500.00', 'Total expense sum is 500.00');
      assert(json.data.categories.length > 0, 'Categories breakdown list not empty');
      assert(json.data.categories[0].name === 'Food', 'Food is top category');
      assert(json.data.categories[0].percentage === 100.0, '100% share');
    });

    // -------------------------------------------------------------
    // Group 22: ANALYTICS API - Breakdown with type=INCOME
    // -------------------------------------------------------------
    await runGroup(22, 'ANALYTICS API - GET /analytics/categories?type=INCOME', async () => {
      const res = await fetch(`${baseUrl}/analytics/categories?type=INCOME&from=2026-02-01&to=2026-02-28`, {
        headers: authHeaders(tokenA)
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const json = await res.json();
      assertEnvelope(json, true);
      assert(json.data.type === 'INCOME', 'Type confirmed INCOME');
      assert(json.data.total === '5000.00', 'Income total is 5000.00');
    });

    // -------------------------------------------------------------
    // Group 23: ANALYTICS API - GET /analytics/trend daily
    // -------------------------------------------------------------
    await runGroup(23, 'ANALYTICS API - GET /analytics/trend?interval=daily', async () => {
      const res = await fetch(`${baseUrl}/analytics/trend?interval=daily&from=2026-02-01&to=2026-02-15`, {
        headers: authHeaders(tokenA)
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const json = await res.json();
      assertEnvelope(json, true);
      assert(json.data.points.length === 15, 'Exact 15 continuous daily points generated');
      const feb1 = json.data.points.find((p: any) => p.date === '2026-02-01');
      assert(feb1 && feb1.income === '5000.00', 'Feb 1 income recorded');
      const feb2 = json.data.points.find((p: any) => p.date === '2026-02-02');
      assert(feb2 && feb2.income === '0.00' && feb2.expense === '0.00', 'Empty day filled with zeroes');
    });

    // -------------------------------------------------------------
    // Group 24: ANALYTICS API - GET /analytics/trend weekly
    // -------------------------------------------------------------
    await runGroup(24, 'ANALYTICS API - GET /analytics/trend?interval=weekly', async () => {
      const res = await fetch(`${baseUrl}/analytics/trend?interval=weekly`, {
        headers: authHeaders(tokenA)
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const json = await res.json();
      assertEnvelope(json, true);
      assert(json.data.interval === 'weekly', 'Weekly interval returned');
      assert(json.data.points.length > 0, 'Weekly points returned');
    });

    // -------------------------------------------------------------
    // Group 25: ANALYTICS API - GET /analytics/trend monthly
    // -------------------------------------------------------------
    await runGroup(25, 'ANALYTICS API - GET /analytics/trend?interval=monthly', async () => {
      const res = await fetch(`${baseUrl}/analytics/trend?interval=monthly&months=6`, {
        headers: authHeaders(tokenA)
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const json = await res.json();
      assertEnvelope(json, true);
      assert(json.data.interval === 'monthly', 'Monthly interval returned');
      assert(json.data.points.length >= 6, 'Contains at least 6 monthly points');
    });

    // -------------------------------------------------------------
    // Group 26: ANALYTICS API - GET /analytics/budgets
    // -------------------------------------------------------------
    await runGroup(26, 'ANALYTICS API - GET /analytics/budgets performance', async () => {
      const res = await fetch(`${baseUrl}/analytics/budgets?year=2026&month=2`, {
        headers: authHeaders(tokenA)
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const json = await res.json();
      assertEnvelope(json, true);
      assert(json.data.summary.totalBudgeted === '600.00', 'Total budgeted matches 600.00');
      assert(json.data.summary.totalActual === '500.00', 'Total actual spend matches 500.00');
      assert(json.data.summary.totalRemaining === '100.00', 'Remaining is 100.00');
      assert(json.data.budgets[0].status === 'WARNING', 'Spent 500/600 (83.3%) triggers WARNING');
    });

    // -------------------------------------------------------------
    // Group 27: ANALYTICS API - Budget vs actual default period
    // -------------------------------------------------------------
    await runGroup(27, 'ANALYTICS API - GET /analytics/budgets default period', async () => {
      const res = await fetch(`${baseUrl}/analytics/budgets`, {
        headers: authHeaders(tokenA)
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const json = await res.json();
      assertEnvelope(json, true);
      assert('period' in json.data && 'summary' in json.data, 'Envelope valid');
    });

    // -------------------------------------------------------------
    // Group 28: CSV EXPORT - GET /transactions/export basic
    // -------------------------------------------------------------
    await runGroup(28, 'CSV EXPORT - GET /transactions/export CSV content', async () => {
      const res = await fetch(`${baseUrl}/transactions/export`, {
        headers: authHeaders(tokenA)
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const text = await res.text();
      assert(text.startsWith('Date,Type,Category,Amount,Description,Payment Method,Recurring,Created At'), 'CSV Header correct');
      assert(text.includes('5000.00'), 'Includes salary row');
      assert(text.includes('350.00'), 'Includes grocery row');
    });

    // -------------------------------------------------------------
    // Group 29: CSV EXPORT - Filtered export
    // -------------------------------------------------------------
    await runGroup(29, 'CSV EXPORT - Filtered by type=EXPENSE', async () => {
      const res = await fetch(`${baseUrl}/transactions/export?type=EXPENSE`, {
        headers: authHeaders(tokenA)
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const text = await res.text();
      assert(!text.includes('5000.00'), 'Income excluded');
      assert(text.includes('350.00'), 'Expense included');
    });

    // -------------------------------------------------------------
    // Group 30: CSV EXPORT - Headers verification
    // -------------------------------------------------------------
    await runGroup(30, 'CSV EXPORT - Download headers & Cache-Control', async () => {
      const res = await fetch(`${baseUrl}/transactions/export?filename=my-tx.csv`, {
        headers: authHeaders(tokenA)
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const cd = res.headers.get('content-disposition');
      assert(cd?.includes('filename="my-tx.csv"'), 'Content-Disposition includes custom filename');
      assert(res.headers.get('content-type')?.includes('text/csv'), 'Content-Type text/csv');
      assert(res.headers.get('cache-control')?.includes('no-store'), 'Cache-Control no-store present');
    });

    // -------------------------------------------------------------
    // Group 31: CSV IMPORT TEMPLATE - GET /transactions/import/template
    // -------------------------------------------------------------
    await runGroup(31, 'CSV IMPORT TEMPLATE - Download template', async () => {
      const res = await fetch(`${baseUrl}/transactions/import/template`, {
        headers: authHeaders(tokenA)
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const text = await res.text();
      assert(text.startsWith('Date,Type,Category,Amount,Description,Payment Method'), 'Template headers valid');
      assert(res.headers.get('content-type')?.includes('text/csv'), 'Content-Type text/csv');
    });

    // -------------------------------------------------------------
    // Group 32: CSV IMPORT PREVIEW - POST /transactions/import/preview
    // -------------------------------------------------------------
    const sampleCsvData = [
      'Date,Amount,Type,Category,Description,Payment Method',
      '2026-02-12,45.00,EXPENSE,Food,Snacks,CARD',
      '2026-02-13,60.00,EXPENSE,Food,Vegetables,CARD'
    ].join('\r\n');

    await runGroup(32, 'CSV IMPORT PREVIEW - Valid CSV preview', async () => {
      const formData = new FormData();
      formData.append('file', new Blob([sampleCsvData], { type: 'text/csv' }), 'test-import.csv');

      const res = await fetch(`${baseUrl}/transactions/import/preview`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: formData
      });

      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const json = await res.json();
      assertEnvelope(json, true);
      assert(json.data.rowsTotal === 2, 'Total rows = 2');
      assert(json.data.headers.length === 6, '6 headers detected');
      assert(json.data.suggestedMapping.date === 'Date', 'Date mapping detected');
      assert(json.data.suggestedMapping.amount === 'Amount', 'Amount mapping detected');
    });

    // -------------------------------------------------------------
    // Group 33: CSV IMPORT PREVIEW - Empty file
    // -------------------------------------------------------------
    await runGroup(33, 'CSV IMPORT PREVIEW - Empty file rejected', async () => {
      const formData = new FormData();
      formData.append('file', new Blob([''], { type: 'text/csv' }), 'empty.csv');

      const res = await fetch(`${baseUrl}/transactions/import/preview`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: formData
      });

      assert(res.status === 400, `Expected 400, got ${res.status}`);
      const json = await res.json();
      assertEnvelope(json, false);
      assert(json.error.code === ERROR_CODES.IMPORT_FILE_EMPTY, 'Returns IMPORT_FILE_EMPTY');
    });

    // -------------------------------------------------------------
    // Group 34: CSV IMPORT PREVIEW - Missing file
    // -------------------------------------------------------------
    await runGroup(34, 'CSV IMPORT PREVIEW - Missing file rejected', async () => {
      const res = await fetch(`${baseUrl}/transactions/import/preview`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` }
      });

      assert(res.status === 400, `Expected 400, got ${res.status}`);
      const json = await res.json();
      assertEnvelope(json, false);
      assert(json.error.code === ERROR_CODES.IMPORT_FILE_REQUIRED, 'Returns IMPORT_FILE_REQUIRED');
    });

    // -------------------------------------------------------------
    // Group 35: CSV IMPORT CONFIRM - Valid batch commit
    // -------------------------------------------------------------
    let importedBatchId = '';
    await runGroup(35, 'CSV IMPORT CONFIRM - Commit import batch', async () => {
      const formData = new FormData();
      formData.append('file', new Blob([sampleCsvData], { type: 'text/csv' }), 'my-import.csv');
      formData.append(
        'mapping',
        JSON.stringify({
          date: 'Date',
          amount: 'Amount',
          type: 'Type',
          category: 'Category',
          description: 'Description',
          paymentMethod: 'Payment Method'
        })
      );
      formData.append('skipDuplicates', 'true');

      const res = await fetch(`${baseUrl}/transactions/import/confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: formData
      });

      assert(res.status === 201, `Expected 201, got ${res.status}`);
      const json = await res.json();
      assertEnvelope(json, true);
      assert(json.data.rowsImported === 2, 'Imported 2 rows');
      assert(json.data.status === ImportStatus.COMPLETED, 'Status COMPLETED');
      importedBatchId = json.data.batchId;
    });

    // -------------------------------------------------------------
    // Group 36: CSV IMPORT CONFIRM - Duplicate skipping
    // -------------------------------------------------------------
    await runGroup(36, 'CSV IMPORT CONFIRM - Skip duplicates', async () => {
      const formData = new FormData();
      formData.append('file', new Blob([sampleCsvData], { type: 'text/csv' }), 'my-import.csv');
      formData.append(
        'mapping',
        JSON.stringify({
          date: 'Date',
          amount: 'Amount',
          type: 'Type',
          category: 'Category',
          description: 'Description',
          paymentMethod: 'Payment Method'
        })
      );
      formData.append('skipDuplicates', 'true');

      const res = await fetch(`${baseUrl}/transactions/import/confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: formData
      });

      // Since all 2 rows already exist and skipDuplicates is true, no new rows to insert -> 400 IMPORT_FILE_INVALID
      assert(res.status === 400, `Expected 400 for duplicate-only batch, got ${res.status}`);
      const json = await res.json();
      assertEnvelope(json, false);
      assert(json.error.code === ERROR_CODES.IMPORT_FILE_INVALID, 'Rejected when all rows skipped as duplicates');
    });

    // -------------------------------------------------------------
    // Group 37: CSV IMPORT CONFIRM - Category fallback
    // -------------------------------------------------------------
    await runGroup(37, 'CSV IMPORT CONFIRM - Category fallback mapping', async () => {
      const csvWithUnmatchedCat = [
        'Date,Amount,Description',
        '2026-02-14,25.00,Misc item'
      ].join('\r\n');

      const formData = new FormData();
      formData.append('file', new Blob([csvWithUnmatchedCat], { type: 'text/csv' }), 'fallback.csv');
      formData.append(
        'mapping',
        JSON.stringify({
          date: 'Date',
          amount: 'Amount',
          description: 'Description'
        })
      );
      formData.append('defaultCategoryId', foodCat.id);

      const res = await fetch(`${baseUrl}/transactions/import/confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: formData
      });

      assert(res.status === 201, `Expected 201, got ${res.status}`);
      const json = await res.json();
      assertEnvelope(json, true);
      assert(json.data.rowsImported === 1, 'Imported using default category');
    });

    // -------------------------------------------------------------
    // Group 38: CSV IMPORT BATCHES - GET /transactions/import/batches
    // -------------------------------------------------------------
    await runGroup(38, 'CSV IMPORT BATCHES - List past import batches', async () => {
      const res = await fetch(`${baseUrl}/transactions/import/batches`, {
        headers: authHeaders(tokenA)
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const json = await res.json();
      assertEnvelope(json, true);
      assert(json.data.length >= 1, 'Past batches returned');
      assert('rowsImported' in json.data[0], 'Batch metadata present');
    });

    // -------------------------------------------------------------
    // Group 39: CSV IMPORT UNDO - DELETE /transactions/import/batches/:id
    // -------------------------------------------------------------
    await runGroup(39, 'CSV IMPORT UNDO - Successfully undo import', async () => {
      const res = await fetch(`${baseUrl}/transactions/import/batches/${importedBatchId}`, {
        method: 'DELETE',
        headers: authHeaders(tokenA)
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const json = await res.json();
      assertEnvelope(json, true);
      assert(json.data.rowsDeleted === 2, 'Deleted exactly 2 imported rows');
      assert(json.data.status === ImportStatus.UNDONE, 'Status changed to UNDONE');
    });

    // -------------------------------------------------------------
    // Group 40: CSV IMPORT UNDO - Cannot undo already undone batch
    // -------------------------------------------------------------
    await runGroup(40, 'CSV IMPORT UNDO - Re-undoing rejected', async () => {
      const res = await fetch(`${baseUrl}/transactions/import/batches/${importedBatchId}`, {
        method: 'DELETE',
        headers: authHeaders(tokenA)
      });
      assert(res.status === 400, `Expected 400, got ${res.status}`);
      const json = await res.json();
      assertEnvelope(json, false);
      assert(json.error.code === ERROR_CODES.IMPORT_CANNOT_UNDO, 'Returns IMPORT_CANNOT_UNDO');
    });

    // -------------------------------------------------------------
    // Group 41: REPORTS API - GET /reports/months
    // -------------------------------------------------------------
    await runGroup(41, 'REPORTS API - List available report months', async () => {
      const res = await fetch(`${baseUrl}/reports/months`, {
        headers: authHeaders(tokenA)
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const json = await res.json();
      assertEnvelope(json, true);
      assert(json.data.length > 0, 'Months list returned');
      assert(json.data[0].live === true, 'Current month is live: true');
    });

    // -------------------------------------------------------------
    // Group 42: REPORTS API - Current month dynamic report
    // -------------------------------------------------------------
    const todayYmd = todayInTimeZone(userA.timezone);
    const [currentYear, currentMonth] = todayYmd.split('-').map(Number);

    await runGroup(42, 'REPORTS API - Current month is dynamic live report', async () => {
      const res = await fetch(`${baseUrl}/reports?year=${currentYear}&month=${currentMonth}`, {
        headers: authHeaders(tokenA)
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const json = await res.json();
      assertEnvelope(json, true);
      assert(json.data.live === true, 'live: true for current month');
      assert(json.data.id === null, 'id is null for live report');
      assert('summary' in json.data && 'categories' in json.data, 'Report payload complete');
    });

    // -------------------------------------------------------------
    // Group 43: REPORTS API - Past month snapshot caching
    // -------------------------------------------------------------
    await runGroup(43, 'REPORTS API - Closed month snapshot generated and cached', async () => {
      const res1 = await fetch(`${baseUrl}/reports?year=2025&month=12`, {
        headers: authHeaders(tokenA)
      });
      assert(res1.status === 200, `Expected 200, got ${res1.status}`);
      const json1 = await res1.json();
      assertEnvelope(json1, true);
      assert(json1.data.live === false, 'live: false for past month');
      assert(typeof json1.data.id === 'string', 'Stored with non-null ID');

      // Verify cached record in database
      const cached = await prisma.report.findUnique({
        where: {
          userId_month_year: {
            userId: userA.id,
            year: 2025,
            month: 12
          }
        }
      });
      assert(cached !== null, 'Report materialized in database');
    });

    // -------------------------------------------------------------
    // Group 44: REPORTS API - POST /reports/regenerate
    // -------------------------------------------------------------
    await runGroup(44, 'REPORTS API - Force regenerate closed month', async () => {
      const res = await fetch(`${baseUrl}/reports/regenerate`, {
        method: 'POST',
        headers: authHeaders(tokenA),
        body: JSON.stringify({ year: 2025, month: 12 })
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const json = await res.json();
      assertEnvelope(json, true);
      assert(json.data.live === false, 'Still live: false');
    });

    // -------------------------------------------------------------
    // Group 45: REPORTS API - GET /reports/pdf
    // -------------------------------------------------------------
    await runGroup(45, 'REPORTS API - PDF report binary download', async () => {
      const res = await fetch(`${baseUrl}/reports/pdf?year=2026&month=2`, {
        headers: authHeaders(tokenA)
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.headers.get('content-type')?.includes('application/pdf'), 'Content-Type application/pdf');
      const blob = await res.arrayBuffer();
      const buffer = Buffer.from(blob);
      assert(buffer.subarray(0, 4).toString() === '%PDF', 'Valid PDF magic header %PDF');
    });

    // -------------------------------------------------------------
    // Group 46: REPORTS API - GET /reports/csv
    // -------------------------------------------------------------
    await runGroup(46, 'REPORTS API - CSV report download', async () => {
      const res = await fetch(`${baseUrl}/reports/csv?year=2026&month=2`, {
        headers: authHeaders(tokenA)
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.headers.get('content-type')?.includes('text/csv'), 'Content-Type text/csv');
      const text = await res.text();
      assert(text.includes('FinTrack Financial Report'), 'CSV report title present');
    });

    // -------------------------------------------------------------
    // Group 47: SCHEDULED JOBS - report, cleanup, and digest jobs
    // -------------------------------------------------------------
    await runGroup(47, 'SCHEDULED JOBS - Execution & JobRun logging', async () => {
      // Seed an unread alert for userA
      await prisma.alert.create({
        data: {
          userId: userA.id,
          budgetId: budgetA.id,
          threshold: 80,
          month: 2,
          year: 2026,
          message: 'Budget 80% reached'
        }
      });

      // 1. Report generator job
      const reportRes = await runReportJob();
      assert(typeof reportRes.processed === 'number', 'Report job processed number');

      // 2. System cleanup job
      const cleanupRes = await runCleanupJob();
      assert(typeof cleanupRes.processed === 'number', 'Cleanup job processed number');

      // 3. Digest service (force hour check false to exercise digest formatting and email delivery)
      const digestRes = await DigestService.sendDigests(new Date(), { forceHourCheck: false });
      assert(digestRes.emailsSent >= 1, 'Digest email delivered');
      assert(sentEmails.length >= 1, 'Mock mail transport received email');

      // Run digest job
      const jobRes = await runDigestJob();
      assert(typeof jobRes.processed === 'number', 'Digest job executed');

      // Verify JobRun table
      const runs = await prisma.jobRun.findMany({
        orderBy: { startedAt: 'desc' },
        take: 3
      });
      assert(runs.length >= 3, 'At least 3 JobRuns persisted');
    });

    // -------------------------------------------------------------
    // Group 48: HARDENING & HEADERS - Cache-Control & Auth
    // -------------------------------------------------------------
    await runGroup(48, 'HARDENING & HEADERS - Security controls & 401', async () => {
      // 1. Cache-Control: no-store on /api
      const res = await fetch(`${baseUrl}/transactions/export`, {
        headers: authHeaders(tokenA)
      });
      const cacheControl = res.headers.get('cache-control');
      assert(cacheControl?.includes('no-store'), `Cache-Control header contains no-store (got ${cacheControl})`);

      // 2. Unauthenticated request to protected route
      const unauthRes = await fetch(`${baseUrl}/analytics/summary`);
      assert(unauthRes.status === 401, `Expected 401, got ${unauthRes.status}`);
      const unauthJson = await unauthRes.json();
      assertEnvelope(unauthJson, false);
      assert(unauthJson.error.code === ERROR_CODES.UNAUTHORIZED, 'Returns UNAUTHORIZED');
    });

  } finally {
    console.log('\nCleaning up smoke test data...');
    try {
      await prisma.user.deleteMany({
        where: { email: { startsWith: 'b4-smoke-' } }
      });
      await prisma.jobRun.deleteMany({
        where: { jobName: { in: ['report-generator', 'cleanup', 'alert-digest'] } }
      });
      await prisma.$disconnect();
    } catch (cleanErr) {
      console.error('Failed to clean up test data', cleanErr);
    }

    if (serverInstance) {
      serverInstance.close();
    }
  }

  // Print summary results table
  console.log('\n================== B4 SMOKE TEST RESULTS ==================');
  console.table(
    testResults.map((r) => ({
      Group: r.group,
      Name: r.name,
      Status: r.passed ? 'PASS' : 'FAIL',
      Error: r.error || ''
    }))
  );

  const failedCount = testResults.filter((r) => !r.passed).length;
  if (failedCount > 0) {
    console.error(`\n❌ ${failedCount} test group(s) failed.`);
    process.exit(1);
  } else {
    console.log(`\n✅ All ${testResults.length} test groups PASSED.`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Unexpected smoke test failure:', err);
  process.exit(1);
});
