/**
 * FinTrack Module B3 Smoke Test Suite
 * 
 * Verifies Automation & Goals: Recurring Rules, Scheduler & Savings Goals.
 * Regression Note: Verifies backward compatibility with Module B1 and Module B2.
 */

import { Frequency, GoalStatus, PaymentMethod, Prisma, PrismaClient, TxType } from '@prisma/client';
import { env, envSchema } from '../../src/config/env';
import { LIMITS } from '../../src/config/limits';
import { DEFAULT_CATEGORIES } from '../../src/services/category.defaults';
import { ERROR_CODES } from '../../src/utils/ApiError';
import {
  addDays,
  addMonthsClamped,
  addYearsClamped,
  calendarMonthsUntil,
  daysInMonth,
  diffDays,
  formatYmd,
  isLeapYear,
  MAX_TZ_LEAD_DAYS,
  parseYmd,
  subtractYears,
  todayInTimeZone
} from '../../src/utils/dates';
import { formatMoney, parseMoney, percentOf } from '../../src/utils/money';
import { hashPassword } from '../../src/utils/password';
import {
  deriveRuleStatus,
  dueOccurrences,
  indexOnOrAfter,
  nextOccurrenceAfter,
  nextOccurrenceOnOrAfter,
  occurrenceAt,
  upcomingOccurrences
} from '../../src/utils/recurrence';
import { withRetry } from '../../src/utils/retry';
import { signAccessToken } from '../../src/utils/tokens';
import { runJob, markStaleJobRuns } from '../../src/jobs/runJob';
import { startJobs, stopJobs } from '../../src/jobs';
import { processLockedRule, processRule, runDueRules } from '../../src/services/recurring.service';
import {
  computeGoalProgress,
  contributeInTx,
  deriveGoalStatus
} from '../../src/services/goal.service';

const prisma = new PrismaClient();

const rawBaseUrl = process.env.SMOKE_BASE_URL || `http://localhost:${env.PORT}`;
const rootUrl = rawBaseUrl.replace(/\/api\/v1\/?$/, '');
const baseUrl = `${rootUrl}/api/v1`;

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

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

// Seeded LCG pseudo-random generator for deterministic tests
function createLcg(seed = 123456789) {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

// Independent calendar helpers for assertions
function independentDaysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  if ([4, 6, 9, 11].includes(month)) return 30;
  return 31;
}

async function createTestUser(
  prefix: string,
  overrides?: { timezone?: string; currency?: string; alertInAppEnabled?: boolean }
) {
  const email = `b3-smoke-${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
  const passwordHash = await hashPassword('ValidPass123!');
  const user = await prisma.user.create({
    data: {
      name: `B3 Smoke User ${prefix}`,
      email,
      passwordHash,
      currency: overrides?.currency ?? 'INR',
      timezone: overrides?.timezone ?? 'Asia/Kolkata',
      alertInAppEnabled: overrides?.alertInAppEnabled ?? true,
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

async function main(): Promise<void> {
  console.log(`Starting FinTrack Module B3 Smoke Test against ${baseUrl}`);

  try {
    // -------------------------------------------------------------
    // Group 1: RECURRENCE MATH (pure, no server)
    // -------------------------------------------------------------
    await runGroup(1, 'RECURRENCE MATH', async () => {
      // 1. MONTHLY from a 31st over 36 months equals independently built calendar
      const start31 = parseYmd('2026-01-31');
      for (let n = 0; n <= 36; n++) {
        const dt = occurrenceAt(start31, Frequency.MONTHLY, n);
        const y = 2026 + Math.floor(n / 12);
        const m = (n % 12) + 1;
        const expectedDay = Math.min(31, independentDaysInMonth(y, m));
        assert(dt.getUTCFullYear() === y, `Year mismatch at month ${n}`);
        assert(dt.getUTCMonth() + 1 === m, `Month mismatch at month ${n}`);
        assert(dt.getUTCDate() === expectedDay, `Day mismatch at month ${n}: expected ${expectedDay}, got ${dt.getUTCDate()}`);
      }

      // 2. 29/30 anchor likewise
      const start30 = parseYmd('2026-04-30');
      const dtMay = occurrenceAt(start30, Frequency.MONTHLY, 1);
      assert(formatYmd(dtMay) === '2026-05-30', 'May 30 occurrence');
      const dtFeb = occurrenceAt(start30, Frequency.MONTHLY, 10); // Feb 2027
      assert(formatYmd(dtFeb) === '2027-02-28', 'Feb 28 occurrence for 30 anchor in non-leap year');

      // 3. YEARLY from Feb 29 gives Feb 28 in non-leap years and Feb 29 in leap years
      const leapStart = parseYmd('2024-02-29');
      const yr1 = occurrenceAt(leapStart, Frequency.YEARLY, 1); // 2025 non-leap
      assert(formatYmd(yr1) === '2025-02-28', '2025 Feb 28');
      const yr4 = occurrenceAt(leapStart, Frequency.YEARLY, 4); // 2028 leap
      assert(formatYmd(yr4) === '2028-02-29', '2028 Feb 29');

      // 4. WEEKLY and DAILY steps
      const dailyStart = parseYmd('2026-03-01');
      assert(formatYmd(occurrenceAt(dailyStart, Frequency.DAILY, 10)) === '2026-03-11', 'Daily +10');
      assert(formatYmd(occurrenceAt(dailyStart, Frequency.WEEKLY, 2)) === '2026-03-15', 'Weekly +2 weeks');

      // 5. Occurrences are never derived from previous occurrence (Jan 31 -> Feb 28 -> Mar 31, not Mar 28)
      const marchAfterFeb = occurrenceAt(start31, Frequency.MONTHLY, 2);
      assert(formatYmd(marchAfterFeb) === '2026-03-31', 'March is 31st, never 28th');

      // 6. Property test with seeded random generator: indexOnOrAfter returns minimal index
      const rng = createLcg(42);
      const frequencies = [Frequency.DAILY, Frequency.WEEKLY, Frequency.MONTHLY, Frequency.YEARLY];
      for (let i = 0; i < 50; i++) {
        const freq = frequencies[Math.floor(rng() * frequencies.length)];
        const startDayOffset = Math.floor(rng() * 100);
        const targetOffset = Math.floor(rng() * 300);
        const s = addDays(parseYmd('2026-01-01'), startDayOffset);
        const t = addDays(s, targetOffset);

        const idx = indexOnOrAfter(s, freq, t);
        const atIdx = occurrenceAt(s, freq, idx);
        assert(atIdx.getTime() >= t.getTime(), `indexOnOrAfter must be >= target for freq ${freq}`);
        if (idx > 0) {
          const before = occurrenceAt(s, freq, idx - 1);
          assert(before.getTime() < t.getTime(), `indexOnOrAfter idx - 1 must be < target for freq ${freq}`);
        }
      }

      // 7. nextOccurrenceAfter strictly greater
      const nextAfter = nextOccurrenceAfter(start31, Frequency.MONTHLY, parseYmd('2026-01-31'));
      assert(formatYmd(nextAfter) === '2026-02-28', 'nextOccurrenceAfter Jan 31 gives Feb 28');

      // 8. dueOccurrences respects today, endDate and maxCount and reports completed correctly
      const ruleDue = {
        startDate: parseYmd('2026-01-01'),
        frequency: Frequency.DAILY,
        nextRunDate: parseYmd('2026-01-01'),
        endDate: parseYmd('2026-01-05')
      };
      const resDue = dueOccurrences(ruleDue, '2026-01-10', 3);
      assert(resDue.dates.length === 3, 'maxCount 3 respected');
      assert(resDue.completed === false, 'Not yet completed at 3 items');
      assert(formatYmd(resDue.nextRunDate) === '2026-01-04', 'Next run date is 4th date');

      const resComplete = dueOccurrences(ruleDue, '2026-01-10', 50);
      assert(resComplete.dates.length === 5, 'Emits up to end date 2026-01-05 (5 days)');
      assert(resComplete.completed === true, 'Rule completed after Jan 5');
    });

    // -------------------------------------------------------------
    // Group 2: DATE HELPERS + GOAL MATH (pure)
    // -------------------------------------------------------------
    await runGroup(2, 'DATE HELPERS + GOAL MATH', async () => {
      // calendarMonthsUntil examples
      assert(calendarMonthsUntil('2026-03-15', '2026-04-15') === 1, 'Same day next month = 1');
      assert(calendarMonthsUntil('2026-03-15', '2026-04-20') === 2, 'Later day = +1');
      assert(calendarMonthsUntil('2026-03-15', '2026-04-10') === 1, 'Earlier day = no extra, whole month count = 1');
      assert(calendarMonthsUntil('2026-03-15', '2026-03-25') === 1, 'Same month future day = 1 (minimum 1)');

      // requiredMonthlySaving rounds UP: remaining 100.00 over 3 months = "33.34"
      const prog = computeGoalProgress(
        {
          targetAmount: new Prisma.Decimal('100.00'),
          currentAmount: new Prisma.Decimal('0.00'),
          deadline: parseYmd('2026-06-15'),
          status: GoalStatus.ACTIVE
        },
        '2026-03-15'
      );
      assert(prog.requiredMonthlySaving === '33.34', '100 / 3 rounded up = 33.34');

      // Overdue, no deadline, completed give null for requiredMonthlySaving
      const progOverdue = computeGoalProgress(
        {
          targetAmount: new Prisma.Decimal('100.00'),
          currentAmount: new Prisma.Decimal('0.00'),
          deadline: parseYmd('2026-03-10'),
          status: GoalStatus.ACTIVE
        },
        '2026-03-15'
      );
      assert(progOverdue.requiredMonthlySaving === null, 'Overdue gives null');
      assert(progOverdue.isOverdue === true, 'isOverdue is true');

      const progNoDeadline = computeGoalProgress(
        {
          targetAmount: new Prisma.Decimal('100.00'),
          currentAmount: new Prisma.Decimal('0.00'),
          deadline: null,
          status: GoalStatus.ACTIVE
        },
        '2026-03-15'
      );
      assert(progNoDeadline.requiredMonthlySaving === null, 'No deadline gives null');

      const progCompleted = computeGoalProgress(
        {
          targetAmount: new Prisma.Decimal('100.00'),
          currentAmount: new Prisma.Decimal('100.00'),
          deadline: parseYmd('2026-06-15'),
          status: GoalStatus.COMPLETED
        },
        '2026-03-15'
      );
      assert(progCompleted.requiredMonthlySaving === null, 'Completed gives null');
    });

    // -------------------------------------------------------------
    // Group 3: ENV + CRON
    // -------------------------------------------------------------
    await runGroup(3, 'ENV + CRON', async () => {
      // Invalid RECURRING_CRON is rejected by env schema
      const badEnvResult = envSchema.safeParse({
        ...process.env,
        RECURRING_CRON: 'not a valid cron expression'
      });
      assert(!badEnvResult.success, 'Invalid RECURRING_CRON must be rejected by schema');

      // stopJobs is idempotent
      await stopJobs();
      await stopJobs();
      assert(true, 'stopJobs completed idempotently');
    });

    // -------------------------------------------------------------
    // Group 4: AUTH
    // -------------------------------------------------------------
    await runGroup(4, 'AUTH', async () => {
      const endpoints = [
        { method: 'GET', url: `${baseUrl}/recurring` },
        { method: 'POST', url: `${baseUrl}/recurring` },
        { method: 'POST', url: `${baseUrl}/recurring/process` },
        { method: 'GET', url: `${baseUrl}/goals` },
        { method: 'POST', url: `${baseUrl}/goals` }
      ];

      for (const ep of endpoints) {
        const res = await fetch(ep.url, {
          method: ep.method,
          headers: { 'Content-Type': 'application/json' }
        });
        assert(res.status === 401, `Endpoint ${ep.method} ${ep.url} should return 401 without token`);
        const json: any = await res.json();
        assertEnvelope(json, false);
        assert(json.error.code === ERROR_CODES.UNAUTHORIZED, 'Must return UNAUTHORIZED code');
      }
    });

    // -------------------------------------------------------------
    // Group 5: RULE VALIDATION
    // -------------------------------------------------------------
    await runGroup(5, 'RULE VALIDATION', async () => {
      const { user, token } = await createTestUser('g5');
      const catExpense = user.categories.find((c) => c.type === TxType.EXPENSE)!;
      const catIncome = user.categories.find((c) => c.type === TxType.INCOME)!;

      // Invalid amounts
      const invalidAmounts = ['0', '-10.00', '10.555', 'abc'];
      for (const amt of invalidAmounts) {
        const res = await fetch(`${baseUrl}/recurring`, {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({
            type: TxType.EXPENSE,
            amount: amt,
            categoryId: catExpense.id,
            frequency: Frequency.MONTHLY,
            startDate: '2026-06-01'
          })
        });
        assert(res.status === 400, `Amount "${amt}" should be rejected 400`);
      }

      // Invalid frequency
      const resFreq = await fetch(`${baseUrl}/recurring`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          type: TxType.EXPENSE,
          amount: '100.00',
          categoryId: catExpense.id,
          frequency: 'HOURLY',
          startDate: '2026-06-01'
        })
      });
      assert(resFreq.status === 400, 'Invalid frequency rejected');

      // endDate before startDate
      const resEnd = await fetch(`${baseUrl}/recurring`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          type: TxType.EXPENSE,
          amount: '100.00',
          categoryId: catExpense.id,
          frequency: Frequency.MONTHLY,
          startDate: '2026-06-01',
          endDate: '2026-05-01'
        })
      });
      assert(resEnd.status === 400, 'endDate before startDate rejected');

      // Category type mismatch
      const resMismatch = await fetch(`${baseUrl}/recurring`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          type: TxType.EXPENSE,
          amount: '100.00',
          categoryId: catIncome.id,
          frequency: Frequency.MONTHLY,
          startDate: '2026-06-01'
        })
      });
      assert(resMismatch.status === 400, 'Category type mismatch rejected');
      const jsonMismatch: any = await resMismatch.json();
      assert(jsonMismatch.error.code === ERROR_CODES.CATEGORY_TYPE_MISMATCH, 'Code CATEGORY_TYPE_MISMATCH');

      // Archived category
      const archivedCat = await prisma.category.create({
        data: {
          userId: user.id,
          name: 'Archived Cat Test',
          type: TxType.EXPENSE,
          isArchived: true
        }
      });
      const resArch = await fetch(`${baseUrl}/recurring`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          type: TxType.EXPENSE,
          amount: '100.00',
          categoryId: archivedCat.id,
          frequency: Frequency.MONTHLY,
          startDate: '2026-06-01'
        })
      });
      assert(resArch.status === 400, 'Archived category rejected');
      const jsonArch: any = await resArch.json();
      assert(jsonArch.error.code === ERROR_CODES.CATEGORY_ARCHIVED, 'Code CATEGORY_ARCHIVED');

      // Strict fields
      const resStrict = await fetch(`${baseUrl}/recurring`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          type: TxType.EXPENSE,
          amount: '100.00',
          categoryId: catExpense.id,
          frequency: Frequency.MONTHLY,
          startDate: '2026-06-01',
          userId: user.id
        })
      });
      assert(resStrict.status === 400, 'Strict body rejects userId');

      // Rule limit reached (create LIMIT via prisma)
      await prisma.recurringRule.createMany({
        data: Array.from({ length: LIMITS.RECURRING.MAX_RULES_PER_USER }).map((_, i) => ({
          userId: user.id,
          categoryId: catExpense.id,
          type: TxType.EXPENSE,
          amount: new Prisma.Decimal('10.00'),
          frequency: Frequency.MONTHLY,
          startDate: parseYmd('2026-06-01'),
          nextRunDate: parseYmd('2026-06-01')
        }))
      });

      const resLimit = await fetch(`${baseUrl}/recurring`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          type: TxType.EXPENSE,
          amount: '100.00',
          categoryId: catExpense.id,
          frequency: Frequency.MONTHLY,
          startDate: '2026-06-01'
        })
      });
      assert(resLimit.status === 409, 'Rule limit returns 409');
      const jsonLimit: any = await resLimit.json();
      assert(jsonLimit.error.code === ERROR_CODES.RULE_LIMIT_REACHED, 'Code RULE_LIMIT_REACHED');
    });

    // -------------------------------------------------------------
    // Group 6: FUTURE START
    // -------------------------------------------------------------
    await runGroup(6, 'FUTURE START', async () => {
      const { user, token } = await createTestUser('g6');
      const cat = user.categories.find((c) => c.type === TxType.EXPENSE)!;

      const today = todayInTimeZone(user.timezone);
      const futureStart = formatYmd(addDays(parseYmd(today), 10));

      const res = await fetch(`${baseUrl}/recurring`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          type: TxType.EXPENSE,
          amount: '50.00',
          categoryId: cat.id,
          frequency: Frequency.MONTHLY,
          startDate: futureStart
        })
      });
      assert(res.status === 201, 'Rule created 201');
      const json: any = await res.json();
      assertEnvelope(json, true);
      assert(json.data.status === 'active', 'Status active');
      assert(json.data.nextRunDate === futureStart, 'nextRunDate equals startDate');
      assert(json.meta.generated === 0, 'meta.generated 0');

      const getRes = await fetch(`${baseUrl}/recurring/${json.data.id}`, {
        headers: authHeaders(token)
      });
      const getJson: any = await getRes.json();
      assert(getJson.data.upcoming.length === LIMITS.RECURRING.PREVIEW_COUNT, 'Preview count equals limits');
    });

    // -------------------------------------------------------------
    // Group 7: BACKDATED CREATE
    // -------------------------------------------------------------
    await runGroup(7, 'BACKDATED CREATE', async () => {
      const { user, token } = await createTestUser('g7');
      const cat = user.categories.find((c) => c.type === TxType.EXPENSE)!;

      const todayYmd = todayInTimeZone(user.timezone);
      const startYmd = subtractYears(todayYmd, 1);

      const res = await fetch(`${baseUrl}/recurring`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          type: TxType.EXPENSE,
          amount: '75.00',
          categoryId: cat.id,
          frequency: Frequency.MONTHLY,
          startDate: startYmd
        })
      });
      assert(res.status === 201, '201 Created');
      const json: any = await res.json();
      assert(json.meta.generated > 0, 'Generated backdated transactions');

      // Verify GET /transactions?recurringId=
      const txRes = await fetch(`${baseUrl}/transactions?recurringId=${json.data.id}`, {
        headers: authHeaders(token)
      });
      const txJson: any = await txRes.json();
      assert(txJson.data.length === json.meta.generated, 'All generated transactions returned');
    });

    // -------------------------------------------------------------
    // Group 8: IDEMPOTENCY
    // -------------------------------------------------------------
    await runGroup(8, 'IDEMPOTENCY', async () => {
      const { user, token } = await createTestUser('g8');
      const cat = user.categories.find((c) => c.type === TxType.EXPENSE)!;
      const todayYmd = todayInTimeZone(user.timezone);
      const startYmd = subtractYears(todayYmd, 1);

      const res = await fetch(`${baseUrl}/recurring`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          type: TxType.EXPENSE,
          amount: '120.00',
          categoryId: cat.id,
          frequency: Frequency.MONTHLY,
          startDate: startYmd
        })
      });
      const json: any = await res.json();
      const ruleId = json.data.id;

      // Process again with same now
      const p1 = await processRule(ruleId);
      assert(p1.outcome === 'notDue', 'Second run produces notDue');

      // Move nextRunDate back in Prisma and process again
      await prisma.recurringRule.update({
        where: { id: ruleId },
        data: { nextRunDate: parseYmd(startYmd) }
      });
      const p2 = await processRule(ruleId);
      assert(p2.outcome === 'generated' && p2.created === 0, 'No duplicates created via skipDuplicates');
    });

    // -------------------------------------------------------------
    // Group 9: CATCH-UP
    // -------------------------------------------------------------
    await runGroup(9, 'CATCH-UP', async () => {
      const { user } = await createTestUser('g9');
      const cat = user.categories.find((c) => c.type === TxType.EXPENSE)!;

      const rule = await prisma.recurringRule.create({
        data: {
          userId: user.id,
          categoryId: cat.id,
          type: TxType.EXPENSE,
          amount: new Prisma.Decimal('50.00'),
          frequency: Frequency.DAILY,
          startDate: parseYmd('2026-01-01'),
          nextRunDate: parseYmd('2026-01-01')
        }
      });

      const fakeNow = parseYmd('2026-01-06'); // 5 intervals
      const outcome = await processRule(rule.id, { now: fakeNow });
      assert(outcome.outcome === 'generated' && outcome.created === 6, 'Generated exactly 6 occurrences (Jan 1-6)');
    });

    // -------------------------------------------------------------
    // Group 10: MONTH-END
    // -------------------------------------------------------------
    await runGroup(10, 'MONTH-END', async () => {
      const { user } = await createTestUser('g10');
      const cat = user.categories.find((c) => c.type === TxType.EXPENSE)!;

      const rule = await prisma.recurringRule.create({
        data: {
          userId: user.id,
          categoryId: cat.id,
          type: TxType.EXPENSE,
          amount: new Prisma.Decimal('100.00'),
          frequency: Frequency.MONTHLY,
          startDate: parseYmd('2026-01-31'),
          nextRunDate: parseYmd('2026-01-31')
        }
      });

      const fakeNow = parseYmd('2026-04-30');
      const outcome = await processRule(rule.id, { now: fakeNow });
      assert(outcome.outcome === 'generated', 'Generated across month ends');

      const txs = await prisma.transaction.findMany({
        where: { recurringId: rule.id },
        orderBy: { date: 'asc' }
      });
      const dates = txs.map((t) => formatYmd(t.date));
      assert(dates.includes('2026-01-31'), 'Has Jan 31');
      assert(dates.includes('2026-02-28'), 'Has Feb 28');
      assert(dates.includes('2026-03-31'), 'Has Mar 31');
      assert(dates.includes('2026-04-30'), 'Has Apr 30');
    });

    // -------------------------------------------------------------
    // Group 11: END DATE
    // -------------------------------------------------------------
    await runGroup(11, 'END DATE', async () => {
      const { user, token } = await createTestUser('g11');
      const cat = user.categories.find((c) => c.type === TxType.EXPENSE)!;

      const res = await fetch(`${baseUrl}/recurring`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          type: TxType.EXPENSE,
          amount: '100.00',
          categoryId: cat.id,
          frequency: Frequency.DAILY,
          startDate: '2026-01-01',
          endDate: '2026-01-03'
        })
      });
      const json: any = await res.json();
      const ruleId = json.data.id;

      await processRule(ruleId, { now: parseYmd('2026-01-10') });
      const check = await prisma.recurringRule.findUniqueOrThrow({ where: { id: ruleId } });
      assert(check.isActive === false, 'Rule isActive false when completed');
      assert(deriveRuleStatus(check) === 'completed', 'Rule status is completed');

      // Pause and resume on completed rule -> 409
      const resPause = await fetch(`${baseUrl}/recurring/${ruleId}/pause`, {
        method: 'POST',
        headers: authHeaders(token)
      });
      assert(resPause.status === 409, 'Pause completed rule returns 409');

      const resResume = await fetch(`${baseUrl}/recurring/${ruleId}/resume`, {
        method: 'POST',
        headers: authHeaders(token)
      });
      assert(resResume.status === 409, 'Resume completed rule returns 409');
    });

    // -------------------------------------------------------------
    // Group 12: PAUSE/RESUME
    // -------------------------------------------------------------
    await runGroup(12, 'PAUSE/RESUME', async () => {
      const { user, token } = await createTestUser('g12');
      const cat = user.categories.find((c) => c.type === TxType.EXPENSE)!;

      const res = await fetch(`${baseUrl}/recurring`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          type: TxType.EXPENSE,
          amount: '100.00',
          categoryId: cat.id,
          frequency: Frequency.DAILY,
          startDate: '2026-05-01'
        })
      });
      const json: any = await res.json();
      const ruleId = json.data.id;

      // Pause
      const pRes = await fetch(`${baseUrl}/recurring/${ruleId}/pause`, {
        method: 'POST',
        headers: authHeaders(token)
      });
      assert(pRes.status === 200, 'Pause 200');
      const pJson: any = await pRes.json();
      assert(pJson.data.isActive === false, 'Rule is paused');

      // Resume
      const rRes = await fetch(`${baseUrl}/recurring/${ruleId}/resume`, {
        method: 'POST',
        headers: authHeaders(token)
      });
      assert(rRes.status === 200, 'Resume 200');
      const rJson: any = await rRes.json();
      assert(rJson.data.isActive === true, 'Rule is active again');
    });

    // -------------------------------------------------------------
    // Group 13: EDIT SEMANTICS
    // -------------------------------------------------------------
    await runGroup(13, 'EDIT SEMANTICS', async () => {
      const { user, token } = await createTestUser('g13');
      const cat = user.categories.find((c) => c.type === TxType.EXPENSE)!;

      const res = await fetch(`${baseUrl}/recurring`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          type: TxType.EXPENSE,
          amount: '100.00',
          categoryId: cat.id,
          frequency: Frequency.MONTHLY,
          startDate: '2026-06-01'
        })
      });
      const json: any = await res.json();
      const ruleId = json.data.id;

      // Cannot change type
      const patchType = await fetch(`${baseUrl}/recurring/${ruleId}`, {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({ type: TxType.INCOME })
      });
      assert(patchType.status === 400, 'Cannot change rule type');

      // Can update amount
      const patchAmt = await fetch(`${baseUrl}/recurring/${ruleId}`, {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({ amount: '250.00' })
      });
      assert(patchAmt.status === 200, 'Update amount 200');
      const patchJson: any = await patchAmt.json();
      assert(patchJson.data.amount === '250.00', 'Amount updated');
    });

    // -------------------------------------------------------------
    // Group 14: DELETE RULE
    // -------------------------------------------------------------
    await runGroup(14, 'DELETE RULE', async () => {
      const { user, token } = await createTestUser('g14');
      const cat = user.categories.find((c) => c.type === TxType.EXPENSE)!;

      const res = await fetch(`${baseUrl}/recurring`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          type: TxType.EXPENSE,
          amount: '100.00',
          categoryId: cat.id,
          frequency: Frequency.MONTHLY,
          startDate: '2026-01-01'
        })
      });
      const json: any = await res.json();
      const ruleId = json.data.id;

      const delRes = await fetch(`${baseUrl}/recurring/${ruleId}`, {
        method: 'DELETE',
        headers: authHeaders(token)
      });
      assert(delRes.status === 200, 'Delete 200');

      const txs = await prisma.transaction.findMany({ where: { userId: user.id } });
      assert(txs.every((t) => t.recurringId === null), 'Transactions kept with null recurringId');
    });

    // -------------------------------------------------------------
    // Group 15: ARCHIVED CATEGORY
    // -------------------------------------------------------------
    await runGroup(15, 'ARCHIVED CATEGORY', async () => {
      const { user } = await createTestUser('g15');
      const cat = user.categories.find((c) => c.type === TxType.EXPENSE)!;

      const rule = await prisma.recurringRule.create({
        data: {
          userId: user.id,
          categoryId: cat.id,
          type: TxType.EXPENSE,
          amount: new Prisma.Decimal('100.00'),
          frequency: Frequency.MONTHLY,
          startDate: parseYmd('2026-01-01'),
          nextRunDate: parseYmd('2026-01-01')
        }
      });

      // Archive category
      await prisma.category.update({
        where: { id: cat.id },
        data: { isArchived: true }
      });

      const outcome = await processRule(rule.id, { now: parseYmd('2026-02-01') });
      assert(outcome.outcome === 'blocked', 'Outcome blocked due to archived category');
    });

    // -------------------------------------------------------------
    // Group 16: BUDGET ALERTS FROM RECURRING
    // -------------------------------------------------------------
    await runGroup(16, 'BUDGET ALERTS FROM RECURRING', async () => {
      const { user, token } = await createTestUser('g16');
      const cat = user.categories.find((c) => c.type === TxType.EXPENSE)!;

      // Create budget for category
      await prisma.budget.create({
        data: {
          userId: user.id,
          categoryId: cat.id,
          type: TxType.EXPENSE,
          month: 1,
          year: 2026,
          amount: new Prisma.Decimal('100.00')
        }
      });

      // Create recurring rule that spends 90.00 (triggers 80% threshold)
      const res = await fetch(`${baseUrl}/recurring`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          type: TxType.EXPENSE,
          amount: '90.00',
          categoryId: cat.id,
          frequency: Frequency.MONTHLY,
          startDate: '2026-01-15'
        })
      });
      const json: any = await res.json();
      assert(json.meta.alerts.length > 0, 'Alert generated for crossing threshold');
    });

    // -------------------------------------------------------------
    // Group 17: TIMEZONES
    // -------------------------------------------------------------
    await runGroup(17, 'TIMEZONES', async () => {
      const { user: userAhead } = await createTestUser('g17a', { timezone: 'Pacific/Kiritimati' }); // UTC+14
      const { user: userBehind } = await createTestUser('g17b', { timezone: 'Pacific/Niue' }); // UTC-11

      const catAhead = userAhead.categories.find((c) => c.type === TxType.EXPENSE)!;
      const catBehind = userBehind.categories.find((c) => c.type === TxType.EXPENSE)!;

      // Given a fixed UTC time: 2026-06-01 12:00:00Z
      // In Pacific/Kiritimati (+14): 2026-06-02
      // In Pacific/Niue (-11): 2026-06-01
      const fixedNow = new Date('2026-06-01T12:00:00Z');
      const todayAhead = todayInTimeZone(userAhead.timezone, fixedNow);
      const todayBehind = todayInTimeZone(userBehind.timezone, fixedNow);

      assert(todayAhead === '2026-06-02', 'Ahead is June 2nd');
      assert(todayBehind === '2026-06-01', 'Behind is June 1st');

      const ruleAhead = await prisma.recurringRule.create({
        data: {
          userId: userAhead.id,
          categoryId: catAhead.id,
          type: TxType.EXPENSE,
          amount: new Prisma.Decimal('10.00'),
          frequency: Frequency.DAILY,
          startDate: parseYmd('2026-06-02'),
          nextRunDate: parseYmd('2026-06-02')
        }
      });

      const ruleBehind = await prisma.recurringRule.create({
        data: {
          userId: userBehind.id,
          categoryId: catBehind.id,
          type: TxType.EXPENSE,
          amount: new Prisma.Decimal('10.00'),
          frequency: Frequency.DAILY,
          startDate: parseYmd('2026-06-02'),
          nextRunDate: parseYmd('2026-06-02')
        }
      });

      const outAhead = await processRule(ruleAhead.id, { now: fixedNow });
      const outBehind = await processRule(ruleBehind.id, { now: fixedNow });

      assert(outAhead.outcome === 'generated', 'Due for ahead user');
      assert(outBehind.outcome === 'notDue', 'Not due yet for behind user');
    });

    // -------------------------------------------------------------
    // Group 18: CONCURRENCY
    // -------------------------------------------------------------
    await runGroup(18, 'CONCURRENCY', async () => {
      const { user } = await createTestUser('g18');
      const cat = user.categories.find((c) => c.type === TxType.EXPENSE)!;

      const rule = await prisma.recurringRule.create({
        data: {
          userId: user.id,
          categoryId: cat.id,
          type: TxType.EXPENSE,
          amount: new Prisma.Decimal('10.00'),
          frequency: Frequency.DAILY,
          startDate: parseYmd('2026-01-01'),
          nextRunDate: parseYmd('2026-01-01')
        }
      });

      // Run parallel process calls
      const [r1, r2] = await Promise.all([
        processRule(rule.id, { now: parseYmd('2026-01-05') }),
        processRule(rule.id, { now: parseYmd('2026-01-05') })
      ]);

      const count = await prisma.transaction.count({ where: { recurringId: rule.id } });
      assert(count === 5, 'Every occurrence created exactly once (5 rows)');
    });

    // -------------------------------------------------------------
    // Group 19: SAFETY CAP
    // -------------------------------------------------------------
    await runGroup(19, 'SAFETY CAP', async () => {
      const { user } = await createTestUser('g19');
      const cat = user.categories.find((c) => c.type === TxType.EXPENSE)!;

      const rule = await prisma.recurringRule.create({
        data: {
          userId: user.id,
          categoryId: cat.id,
          type: TxType.EXPENSE,
          amount: new Prisma.Decimal('10.00'),
          frequency: Frequency.DAILY,
          startDate: parseYmd('2026-01-01'),
          nextRunDate: parseYmd('2026-01-01')
        }
      });

      // Run with small maxOccurrences (3)
      const out1 = await processRule(rule.id, { now: parseYmd('2026-01-10'), maxOccurrences: 3 });
      assert(out1.outcome === 'generated' && out1.created === 3, 'First batch created 3');

      const out2 = await processRule(rule.id, { now: parseYmd('2026-01-10'), maxOccurrences: 10 });
      assert(out2.outcome === 'generated' && out2.created === 7, 'Second batch finished remaining 7');
    });

    // -------------------------------------------------------------
    // Group 20: RULE LIST
    // -------------------------------------------------------------
    await runGroup(20, 'RULE LIST', async () => {
      const { user, token } = await createTestUser('g20');
      const cat = user.categories.find((c) => c.type === TxType.EXPENSE)!;

      await fetch(`${baseUrl}/recurring`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          type: TxType.EXPENSE,
          amount: '100.00',
          categoryId: cat.id,
          frequency: Frequency.MONTHLY,
          startDate: '2026-06-01'
        })
      });

      const res = await fetch(`${baseUrl}/recurring?status=active`, {
        headers: authHeaders(token)
      });
      assert(res.status === 200, 'List 200');
      const json: any = await res.json();
      assert(json.data.length === 1, 'Contains 1 rule');
    });

    // -------------------------------------------------------------
    // Group 21: TRANSACTION FILTER
    // -------------------------------------------------------------
    await runGroup(21, 'TRANSACTION FILTER', async () => {
      const { user, token } = await createTestUser('g21');
      const cat = user.categories.find((c) => c.type === TxType.EXPENSE)!;

      const res = await fetch(`${baseUrl}/recurring`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          type: TxType.EXPENSE,
          amount: '50.00',
          categoryId: cat.id,
          frequency: Frequency.MONTHLY,
          startDate: '2026-01-01'
        })
      });
      const json: any = await res.json();
      const ruleId = json.data.id;

      const txRes = await fetch(`${baseUrl}/transactions?recurringId=${ruleId}`, {
        headers: authHeaders(token)
      });
      assert(txRes.status === 200, 'Transactions query 200');
      const txJson: any = await txRes.json();
      assert(txJson.data.length === json.meta.generated, 'Only rule transactions returned');
    });

    // -------------------------------------------------------------
    // Group 22: JOB LOG
    // -------------------------------------------------------------
    await runGroup(22, 'JOB LOG', async () => {
      const res = await runJob('b3-smoke-test-job', async () => {
        return { processed: 5, failed: 0 };
      });
      assert(res.processed === 5, 'Job processed 5');

      const jobRun = await prisma.jobRun.findFirst({
        where: { jobName: 'b3-smoke-test-job' }
      });
      assert(jobRun?.status === 'SUCCESS', 'JobRun status SUCCESS');

      // Throwing job
      await runJob('b3-smoke-fail-job', async () => {
        throw new Error('Test failure');
      });
      const failedRun = await prisma.jobRun.findFirst({
        where: { jobName: 'b3-smoke-fail-job' }
      });
      assert(failedRun?.status === 'FAILED', 'Failed status recorded');

      // Overlap guard
      let resolveFirst: () => void;
      const blocker = new Promise<void>((r) => {
        resolveFirst = r;
      });
      const p1 = runJob('b3-smoke-overlap', async () => {
        await blocker;
        return { processed: 1, failed: 0 };
      });
      const p2 = await runJob('b3-smoke-overlap', async () => {
        return { processed: 2, failed: 0 };
      });
      assert(p2.skipped === true, 'Overlapping job skipped');
      resolveFirst!();
      await p1;
    });

    // -------------------------------------------------------------
    // Group 23: RETRY
    // -------------------------------------------------------------
    await runGroup(23, 'RETRY', async () => {
      let attempts = 0;
      const result = await withRetry(
        async () => {
          attempts++;
          if (attempts < 3) {
            const err = new Error('deadlock detected');
            (err as any).code = 'P2034';
            throw err;
          }
          return 'ok';
        },
        { maxRetries: 3, baseMs: 10 }
      );
      assert(result === 'ok', 'Succeeded after retries');
      assert(attempts === 3, 'Retried exactly 3 times');
    });

    // -------------------------------------------------------------
    // Group 24: MANUAL PROCESS
    // -------------------------------------------------------------
    await runGroup(24, 'MANUAL PROCESS', async () => {
      const { user, token } = await createTestUser('g24');
      const cat = user.categories.find((c) => c.type === TxType.EXPENSE)!;

      await fetch(`${baseUrl}/recurring`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          type: TxType.EXPENSE,
          amount: '10.00',
          categoryId: cat.id,
          frequency: Frequency.DAILY,
          startDate: '2026-06-01'
        })
      });

      const res = await fetch(`${baseUrl}/recurring/process`, {
        method: 'POST',
        headers: authHeaders(token)
      });
      assert(res.status === 200, 'Process 200');
      const json: any = await res.json();
      assert('rulesProcessed' in json.data, 'Has rulesProcessed');
    });

    // -------------------------------------------------------------
    // Group 25: GOAL VALIDATION
    // -------------------------------------------------------------
    await runGroup(25, 'GOAL VALIDATION', async () => {
      const { user, token } = await createTestUser('g25');

      // Empty name
      const resName = await fetch(`${baseUrl}/goals`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: '',
          targetAmount: '1000.00'
        })
      });
      assert(resName.status === 400, 'Empty name rejected');

      // Past deadline
      const resDeadline = await fetch(`${baseUrl}/goals`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: 'Past Goal',
          targetAmount: '1000.00',
          deadline: '2020-01-01'
        })
      });
      assert(resDeadline.status === 400, 'Past deadline rejected');
      const jsonDead: any = await resDeadline.json();
      assert(jsonDead.error.code === ERROR_CODES.INVALID_DEADLINE, 'Code INVALID_DEADLINE');

      // Strict fields
      const resStrict = await fetch(`${baseUrl}/goals`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: 'Strict Goal',
          targetAmount: '1000.00',
          currentAmount: '500.00'
        })
      });
      assert(resStrict.status === 400, 'Strict rejects currentAmount');
    });

    // -------------------------------------------------------------
    // Group 26: GOAL CREATE
    // -------------------------------------------------------------
    await runGroup(26, 'GOAL CREATE', async () => {
      const { token } = await createTestUser('g26');

      const res = await fetch(`${baseUrl}/goals`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: 'Emergency Fund',
          targetAmount: '50000.00',
          startingAmount: '10000.00'
        })
      });
      assert(res.status === 201, '201 Created');
      const json: any = await res.json();
      assert(json.data.currentAmount === '10000.00', 'currentAmount equals starting balance');
      assert(json.data.contributionCount === 1, '1 initial contribution created');
    });

    // -------------------------------------------------------------
    // Group 27: DEPOSIT
    // -------------------------------------------------------------
    await runGroup(27, 'DEPOSIT', async () => {
      const { token } = await createTestUser('g27');

      const gRes = await fetch(`${baseUrl}/goals`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: 'Bike Fund',
          targetAmount: '100.00'
        })
      });
      const gJson: any = await gRes.json();
      const goalId = gJson.data.id;

      // Deposit 0.10 then 0.20 -> "0.30"
      await fetch(`${baseUrl}/goals/${goalId}/contributions`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          kind: 'DEPOSIT',
          amount: '0.10'
        })
      });

      const dRes2 = await fetch(`${baseUrl}/goals/${goalId}/contributions`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          kind: 'DEPOSIT',
          amount: '0.20'
        })
      });
      const dJson2: any = await dRes2.json();
      assert(dJson2.data.goal.currentAmount === '0.30', 'Exact decimal math 0.10 + 0.20 = 0.30');
    });

    // -------------------------------------------------------------
    // Group 28: WITHDRAW
    // -------------------------------------------------------------
    await runGroup(28, 'WITHDRAW', async () => {
      const { token } = await createTestUser('g28');

      const gRes = await fetch(`${baseUrl}/goals`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: 'Vacation',
          targetAmount: '500.00',
          startingAmount: '100.00'
        })
      });
      const gJson: any = await gRes.json();
      const goalId = gJson.data.id;

      // Overdraw -> 400
      const wFail = await fetch(`${baseUrl}/goals/${goalId}/contributions`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          kind: 'WITHDRAWAL',
          amount: '150.00'
        })
      });
      assert(wFail.status === 400, 'Overdraw returns 400');
      const wFailJson: any = await wFail.json();
      assert(wFailJson.error.code === ERROR_CODES.INSUFFICIENT_GOAL_FUNDS, 'Code INSUFFICIENT_GOAL_FUNDS');

      // Valid withdrawal of entire balance (100.00)
      const wOk = await fetch(`${baseUrl}/goals/${goalId}/contributions`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          kind: 'WITHDRAWAL',
          amount: '100.00'
        })
      });
      assert(wOk.status === 201, 'Withdrawal 201');
      const wOkJson: any = await wOk.json();
      assert(wOkJson.data.goal.currentAmount === '0.00', 'Current balance is 0.00');
      assert(wOkJson.data.contribution.amount === '-100.00', 'Contribution amount stored negative');
    });

    // -------------------------------------------------------------
    // Group 29: INVARIANT
    // -------------------------------------------------------------
    await runGroup(29, 'INVARIANT', async () => {
      const { token } = await createTestUser('g29');

      const gRes = await fetch(`${baseUrl}/goals`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: 'Invariant Goal',
          targetAmount: '1000.00',
          startingAmount: '500.00'
        })
      });
      const gJson: any = await gRes.json();
      const goalId = gJson.data.id;

      const rng = createLcg(99);
      for (let i = 0; i < 50; i++) {
        const isDep = rng() > 0.4;
        const amt = (Math.floor(rng() * 20) + 1).toFixed(2);
        await fetch(`${baseUrl}/goals/${goalId}/contributions`, {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({
            kind: isDep ? 'DEPOSIT' : 'WITHDRAWAL',
            amount: amt
          })
        });
      }

      // Read directly from database
      const goal = await prisma.savingsGoal.findUniqueOrThrow({ where: { id: goalId } });
      const contribs = await prisma.goalContribution.findMany({ where: { goalId } });
      const sum = contribs.reduce((acc, c) => acc.add(c.amount), new Prisma.Decimal(0));

      assert(goal.currentAmount.equals(sum), 'SavingsGoal.currentAmount strictly equals SUM(contributions)');
      assert(goal.status === deriveGoalStatus(goal.currentAmount, goal.targetAmount, false), 'Status matches deriveGoalStatus');
    });

    // -------------------------------------------------------------
    // Group 30: LINKED TRANSACTION
    // -------------------------------------------------------------
    await runGroup(30, 'LINKED TRANSACTION', async () => {
      const { user, token } = await createTestUser('g30');
      const catExpense = user.categories.find((c) => c.type === TxType.EXPENSE)!;

      const gRes = await fetch(`${baseUrl}/goals`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: 'Gadget Goal',
          targetAmount: '1000.00'
        })
      });
      const gJson: any = await gRes.json();
      const goalId = gJson.data.id;

      // Deposit with createTransaction creates EXPENSE
      const depRes = await fetch(`${baseUrl}/goals/${goalId}/contributions`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          kind: 'DEPOSIT',
          amount: '200.00',
          createTransaction: true,
          categoryId: catExpense.id
        })
      });
      assert(depRes.status === 201, 'Linked deposit 201');
      const depJson: any = await depRes.json();
      assert(depJson.data.contribution.transactionId !== null, 'transactionId populated');

      const tx = await prisma.transaction.findUniqueOrThrow({
        where: { id: depJson.data.contribution.transactionId }
      });
      assert(tx.type === TxType.EXPENSE, 'Created EXPENSE transaction');
      assert(tx.amount.equals(new Prisma.Decimal('200.00')), 'Amount matches');
    });

    // -------------------------------------------------------------
    // Group 31: ATOMIC ROLLBACK
    // -------------------------------------------------------------
    await runGroup(31, 'ATOMIC ROLLBACK', async () => {
      const { user } = await createTestUser('g31');
      const goal = await prisma.savingsGoal.create({
        data: {
          userId: user.id,
          name: 'Rollback Goal',
          targetAmount: new Prisma.Decimal('100.00'),
          currentAmount: new Prisma.Decimal('0.00')
        }
      });

      try {
        await prisma.$transaction(async (tx) => {
          await contributeInTx(tx, user.id, goal.id, {
            kind: 'DEPOSIT',
            amount: '50.00'
          });
          throw new Error('forced rollback');
        });
      } catch {
        // Expected rollback
      }

      const freshGoal = await prisma.savingsGoal.findUniqueOrThrow({ where: { id: goal.id } });
      const contribCount = await prisma.goalContribution.count({ where: { goalId: goal.id } });
      assert(freshGoal.currentAmount.isZero(), 'Goal amount remains 0.00');
      assert(contribCount === 0, 'No contributions persisted');
    });

    // -------------------------------------------------------------
    // Group 32: GOAL CONCURRENCY
    // -------------------------------------------------------------
    await runGroup(32, 'GOAL CONCURRENCY', async () => {
      const { token } = await createTestUser('g32');
      const gRes = await fetch(`${baseUrl}/goals`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: 'Concurrent Goal',
          targetAmount: '1000.00'
        })
      });
      const gJson: any = await gRes.json();
      const goalId = gJson.data.id;

      // 10 parallel deposits of 10.00
      await Promise.all(
        Array.from({ length: 10 }).map(() =>
          fetch(`${baseUrl}/goals/${goalId}/contributions`, {
            method: 'POST',
            headers: authHeaders(token),
            body: JSON.stringify({
              kind: 'DEPOSIT',
              amount: '10.00'
            })
          })
        )
      );

      const check = await prisma.savingsGoal.findUniqueOrThrow({ where: { id: goalId } });
      assert(check.currentAmount.equals(new Prisma.Decimal('100.00')), 'Total equals exactly 100.00');
    });

    // -------------------------------------------------------------
    // Group 33: ARCHIVE
    // -------------------------------------------------------------
    await runGroup(33, 'ARCHIVE', async () => {
      const { token } = await createTestUser('g33');
      const gRes = await fetch(`${baseUrl}/goals`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: 'Old Goal',
          targetAmount: '100.00',
          startingAmount: '100.00'
        })
      });
      const gJson: any = await gRes.json();
      const goalId = gJson.data.id;

      // Archive
      const aRes = await fetch(`${baseUrl}/goals/${goalId}/archive`, {
        method: 'POST',
        headers: authHeaders(token)
      });
      assert(aRes.status === 200, 'Archive 200');

      // Reject contribute on archived
      const cRes = await fetch(`${baseUrl}/goals/${goalId}/contributions`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          kind: 'DEPOSIT',
          amount: '10.00'
        })
      });
      assert(cRes.status === 409, 'Contribute to archived returns 409');

      // Unarchive recomputes funded status -> COMPLETED
      const uRes = await fetch(`${baseUrl}/goals/${goalId}/unarchive`, {
        method: 'POST',
        headers: authHeaders(token)
      });
      assert(uRes.status === 200, 'Unarchive 200');
      const uJson: any = await uRes.json();
      assert(uJson.data.status === 'COMPLETED', 'Status restored to COMPLETED, not blind ACTIVE');
    });

    // -------------------------------------------------------------
    // Group 34: GOAL EDIT
    // -------------------------------------------------------------
    await runGroup(34, 'GOAL EDIT', async () => {
      const { token } = await createTestUser('g34');
      const gRes = await fetch(`${baseUrl}/goals`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: 'Edit Target Goal',
          targetAmount: '500.00',
          startingAmount: '200.00'
        })
      });
      const gJson: any = await gRes.json();
      const goalId = gJson.data.id;

      // Lower target below current (150.00) -> status becomes COMPLETED
      const pRes = await fetch(`${baseUrl}/goals/${goalId}`, {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({ targetAmount: '150.00' })
      });
      assert(pRes.status === 200, 'Edit 200');
      const pJson: any = await pRes.json();
      assert(pJson.data.status === 'COMPLETED', 'Goal flips to COMPLETED');
    });

    // -------------------------------------------------------------
    // Group 35: PROGRESS
    // -------------------------------------------------------------
    await runGroup(35, 'PROGRESS', async () => {
      const { user, token } = await createTestUser('g35');
      const today = todayInTimeZone(user.timezone);
      const futureDeadline = formatYmd(addMonthsClamped(parseYmd(today), 4));

      const res = await fetch(`${baseUrl}/goals`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: 'Progress Goal',
          targetAmount: '1000.00',
          startingAmount: '250.00',
          deadline: futureDeadline
        })
      });
      const json: any = await res.json();
      assert(json.data.remaining === '750.00', 'Remaining 750.00');
      assert(json.data.percentComplete === 25.0, '25% complete');
      assert(json.data.requiredMonthlySaving !== null, 'requiredMonthlySaving calculated');
    });

    // -------------------------------------------------------------
    // Group 36: HISTORY
    // -------------------------------------------------------------
    await runGroup(36, 'HISTORY', async () => {
      const { token } = await createTestUser('g36');
      const gRes = await fetch(`${baseUrl}/goals`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: 'History Goal',
          targetAmount: '1000.00',
          startingAmount: '10.00'
        })
      });
      const gJson: any = await gRes.json();
      const goalId = gJson.data.id;

      const cRes = await fetch(`${baseUrl}/goals/${goalId}/contributions?page=1&limit=10`, {
        headers: authHeaders(token)
      });
      assert(cRes.status === 200, 'Contributions list 200');
      const cJson: any = await cRes.json();
      assert(cJson.data.length === 1, 'Contains starting contribution');
      assert(cJson.meta.total === 1, 'Total 1');
    });

    // -------------------------------------------------------------
    // Group 37: DELETE + LINKS
    // -------------------------------------------------------------
    await runGroup(37, 'DELETE + LINKS', async () => {
      const { user, token } = await createTestUser('g37');
      const cat = user.categories.find((c) => c.type === TxType.EXPENSE)!;

      const gRes = await fetch(`${baseUrl}/goals`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: 'Linked Goal Delete',
          targetAmount: '1000.00'
        })
      });
      const gJson: any = await gRes.json();
      const goalId = gJson.data.id;

      const depRes = await fetch(`${baseUrl}/goals/${goalId}/contributions`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          kind: 'DEPOSIT',
          amount: '100.00',
          createTransaction: true,
          categoryId: cat.id
        })
      });
      const depJson: any = await depRes.json();
      const txId = depJson.data.contribution.transactionId;

      // Delete goal
      const delGoal = await fetch(`${baseUrl}/goals/${goalId}`, {
        method: 'DELETE',
        headers: authHeaders(token)
      });
      assert(delGoal.status === 200, 'Goal deleted');

      // Transaction still exists
      const txCheck = await prisma.transaction.findUnique({ where: { id: txId } });
      assert(txCheck !== null, 'Linked transaction retained');
    });

    // -------------------------------------------------------------
    // Group 38: IDOR SWEEP
    // -------------------------------------------------------------
    await runGroup(38, 'IDOR SWEEP', async () => {
      const { user: userA, token: tokenA } = await createTestUser('g38a');
      const { token: tokenB } = await createTestUser('g38b');
      const catA = userA.categories.find((c) => c.type === TxType.EXPENSE)!;

      const rRes = await fetch(`${baseUrl}/recurring`, {
        method: 'POST',
        headers: authHeaders(tokenA),
        body: JSON.stringify({
          type: TxType.EXPENSE,
          amount: '50.00',
          categoryId: catA.id,
          frequency: Frequency.MONTHLY,
          startDate: '2026-06-01'
        })
      });
      const rJson: any = await rRes.json();
      const ruleId = rJson.data.id;

      // User B accesses User A's recurring rule
      const bAccess = await fetch(`${baseUrl}/recurring/${ruleId}`, {
        headers: authHeaders(tokenB)
      });
      assert(bAccess.status === 404, 'Foreign rule access returns 404');
    });

    // -------------------------------------------------------------
    // Group 39: MONEY FORMAT
    // -------------------------------------------------------------
    await runGroup(39, 'MONEY FORMAT', async () => {
      const { token } = await createTestUser('g39');
      const gRes = await fetch(`${baseUrl}/goals`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: 'Format Check Goal',
          targetAmount: '1234.50',
          startingAmount: '100.00'
        })
      });
      const gJson: any = await gRes.json();
      assert(typeof gJson.data.targetAmount === 'string', 'targetAmount is string');
      assert(typeof gJson.data.currentAmount === 'string', 'currentAmount is string');
      assert(typeof gJson.data.remaining === 'string', 'remaining is string');
      assert(/^\d+\.\d{2}$/.test(gJson.data.targetAmount), 'targetAmount has exactly 2 decimals');
      assert(/^\d+\.\d{2}$/.test(gJson.data.currentAmount), 'currentAmount has exactly 2 decimals');
    });

    // -------------------------------------------------------------
    // Group 40: REGRESSION + CASCADE
    // -------------------------------------------------------------
    await runGroup(40, 'REGRESSION + CASCADE', async () => {
      const { user, token } = await createTestUser('g40');
      const cat = user.categories.find((c) => c.type === TxType.EXPENSE)!;

      await fetch(`${baseUrl}/recurring`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          type: TxType.EXPENSE,
          amount: '10.00',
          categoryId: cat.id,
          frequency: Frequency.DAILY,
          startDate: '2026-06-01'
        })
      });

      await fetch(`${baseUrl}/goals`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: 'Cascade Goal',
          targetAmount: '500.00',
          startingAmount: '50.00'
        })
      });

      // Delete user via B1 endpoint
      const delUser = await fetch(`${baseUrl}/users/me`, {
        method: 'DELETE',
        headers: authHeaders(token),
        body: JSON.stringify({ password: 'ValidPass123!' })
      });
      assert(delUser.status === 200, 'User profile deleted');

      // Verify cascade
      const rules = await prisma.recurringRule.count({ where: { userId: user.id } });
      const goals = await prisma.savingsGoal.count({ where: { userId: user.id } });
      const contribs = await prisma.goalContribution.count({ where: { userId: user.id } });

      assert(rules === 0, 'Recurring rules cascaded to 0');
      assert(goals === 0, 'Savings goals cascaded to 0');
      assert(contribs === 0, 'Goal contributions cascaded to 0');
    });

    // -------------------------------------------------------------
    // Group 41: PERFORMANCE
    // -------------------------------------------------------------
    await runGroup(41, 'PERFORMANCE', async () => {
      const { user, token } = await createTestUser('g41');
      const cat = user.categories.find((c) => c.type === TxType.EXPENSE)!;

      // Seed 20 rules and 20 goals directly via prisma
      await prisma.recurringRule.createMany({
        data: Array.from({ length: 20 }).map((_, i) => ({
          userId: user.id,
          categoryId: cat.id,
          type: TxType.EXPENSE,
          amount: new Prisma.Decimal('10.00'),
          frequency: Frequency.DAILY,
          startDate: parseYmd('2026-06-01'),
          nextRunDate: parseYmd('2026-06-01')
        }))
      });

      await prisma.savingsGoal.createMany({
        data: Array.from({ length: 20 }).map((_, i) => ({
          userId: user.id,
          name: `Perf Goal ${i}`,
          targetAmount: new Prisma.Decimal('1000.00'),
          currentAmount: new Prisma.Decimal('100.00')
        }))
      });

      const t0 = Date.now();
      const rRes = await fetch(`${baseUrl}/recurring`, { headers: authHeaders(token) });
      const rDuration = Date.now() - t0;
      assert(rRes.status === 200, 'GET /recurring 200');
      assert(rDuration < LIMITS.PERF.READ_TARGET_MS, `GET /recurring took ${rDuration}ms, under ${LIMITS.PERF.READ_TARGET_MS}ms target`);

      const t1 = Date.now();
      const gRes = await fetch(`${baseUrl}/goals`, { headers: authHeaders(token) });
      const gDuration = Date.now() - t1;
      assert(gRes.status === 200, 'GET /goals 200');
      assert(gDuration < LIMITS.PERF.READ_TARGET_MS, `GET /goals took ${gDuration}ms, under ${LIMITS.PERF.READ_TARGET_MS}ms target`);

      console.log(`Performance check timings: GET /recurring = ${rDuration}ms, GET /goals = ${gDuration}ms`);
    });

  } finally {
    console.log('Cleaning up smoke test data...');
    try {
      await prisma.user.deleteMany({
        where: { email: { startsWith: 'b3-smoke-' } }
      });
      await prisma.jobRun.deleteMany({
        where: { jobName: { startsWith: 'b3-smoke-' } }
      });
      await prisma.$disconnect();
    } catch (cleanErr) {
      console.error('Failed to clean up test data', cleanErr);
    }
  }

  // Print summary results table
  console.log('\n================== B3 SMOKE TEST RESULTS ==================');
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
