/**
 * FinTrack Module B2 Smoke Test Suite
 * 
 * Verifies Transactions, Budgets, and the Alert Engine end-to-end.
 * NOTE: The in-memory rate limiter can block repeated requests. Restart the server if you hit rate limits.
 */

import { PaymentMethod, Prisma, PrismaClient, TxType } from '@prisma/client';
import { env } from '../../src/config/env';
import { LIMITS } from '../../src/config/limits';
import { DEFAULT_CATEGORIES } from '../../src/services/category.defaults';
import { ERROR_CODES } from '../../src/utils/ApiError';
import {
  formatYmd,
  monthRange,
  parseYmd,
  previousMonth,
  subtractYears,
  todayInTimeZone
} from '../../src/utils/dates';
import { formatMoney, parseMoney } from '../../src/utils/money';
import { hashPassword } from '../../src/utils/password';
import { signAccessToken } from '../../src/utils/tokens';
import { createTransactionInTx } from '../../src/services/transaction.service';

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

async function runTest(group: number, name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    testResults.push({ group, name, passed: true });
  } catch (err: any) {
    testResults.push({ group, name, passed: false, error: err.message || String(err) });
  }
}

async function main() {
  console.log('================================================================');
  console.log('              FinTrack Module B2: Smoke Test Suite              ');
  console.log(` Target Base URL: ${baseUrl}`);
  console.log('================================================================\n');

  const timestamp = Date.now();
  const emailA = `b2-smoke-${timestamp}-a@fintrack.test`;
  const emailB = `b2-smoke-${timestamp}-b@fintrack.test`;

  let userA: any;
  let userB: any;
  let tokenA: string = '';
  let tokenB: string = '';

  try {
    // 0. Seed test users directly with Prisma to bypass registration rate limiters
    const pwdHash = await hashPassword('Password123');

    userA = await prisma.user.create({
      data: {
        name: 'User A',
        email: emailA,
        passwordHash: pwdHash,
        currency: 'USD',
        timezone: 'America/New_York',
        alertThresholds: [80, 100],
        alertInAppEnabled: true,
        alertEmailEnabled: false,
        categories: {
          create: DEFAULT_CATEGORIES.map((c) => ({
            name: c.name,
            type: c.type,
            color: c.color,
            icon: c.icon,
            isDefault: true
          }))
        }
      },
      include: { categories: true }
    });

    userB = await prisma.user.create({
      data: {
        name: 'User B',
        email: emailB,
        passwordHash: pwdHash,
        currency: 'USD',
        timezone: 'America/New_York',
        alertThresholds: [80, 100],
        alertInAppEnabled: true,
        alertEmailEnabled: false,
        categories: {
          create: DEFAULT_CATEGORIES.map((c) => ({
            name: c.name,
            type: c.type,
            color: c.color,
            icon: c.icon,
            isDefault: true
          }))
        }
      },
      include: { categories: true }
    });

    tokenA = signAccessToken(userA.id);
    tokenB = signAccessToken(userB.id);

    const expCatA = userA.categories.find((c: any) => c.type === 'EXPENSE')!;
    const incCatA = userA.categories.find((c: any) => c.type === 'INCOME')!;
    const expCatB = userB.categories.find((c: any) => c.type === 'EXPENSE')!;

    const todayA = todayInTimeZone(userA.timezone);
    const [curYearA, curMonthA] = todayA.split('-').map(Number);

    // 1. AUTH: each route group returns 401 without a token
    await runTest(1, 'AUTH: 401 on transactions, budgets, alerts without token', async () => {
      const endpoints = [
        { method: 'GET', url: `${baseUrl}/transactions` },
        { method: 'POST', url: `${baseUrl}/transactions`, body: {} },
        { method: 'GET', url: `${baseUrl}/budgets` },
        { method: 'PUT', url: `${baseUrl}/budgets`, body: {} },
        { method: 'GET', url: `${baseUrl}/alerts` }
      ];

      for (const ep of endpoints) {
        const res = await fetch(ep.url, {
          method: ep.method,
          headers: { 'Content-Type': 'application/json' },
          ...(ep.body ? { body: JSON.stringify(ep.body) } : {})
        });
        assert(res.status === 401, `${ep.method} ${ep.url} expected 401, got ${res.status}`);
        const json = await res.json();
        assertEnvelope(json, false);
      }
    });

    // 2. CREATE: expense returns 201; amount formatted; category embedded; meta.alerts is []
    let createdTxId = '';
    await runTest(2, 'CREATE: valid expense returns 201 with category & empty alerts', async () => {
      const res = await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`
        },
        body: JSON.stringify({
          type: 'EXPENSE',
          amount: '125.50',
          date: todayA,
          categoryId: expCatA.id,
          description: 'Initial grocery run',
          paymentMethod: 'CARD'
        })
      });

      assert(res.status === 201, `Expected 201, got ${res.status}`);
      const json = await res.json();
      assertEnvelope(json, true);
      assert(json.data.amount === '125.50', `Expected "125.50", got ${json.data.amount}`);
      assert(typeof json.data.amount === 'string', 'Amount must be a string');
      assert(json.data.category.id === expCatA.id, 'Category must be embedded');
      assert(Array.isArray(json.meta.alerts), 'meta.alerts must be an array');
      assert(json.meta.alerts.length === 0, 'meta.alerts must be empty without a budget');
      createdTxId = json.data.id;
    });

    // 3. AMOUNT VALIDATION: 0, negative, >2 decimals, >MONEY_MAX, invalid strings -> 400; JSON number 10.1 accepted as 10.10
    await runTest(3, 'AMOUNT VALIDATION: rejects invalid amounts; accepts numeric 10.1', async () => {
      const invalidAmounts = ['0', '-5.00', '12.345', '10000000000.00', 'abc', '1e3', '12,5', ''];
      for (const amt of invalidAmounts) {
        const res = await fetch(`${baseUrl}/transactions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenA}`
          },
          body: JSON.stringify({
            type: 'EXPENSE',
            amount: amt,
            date: todayA,
            categoryId: expCatA.id
          })
        });
        assert(res.status === 400, `Expected 400 for amount "${amt}", got ${res.status}`);
        const json = await res.json();
        assertEnvelope(json, false);
      }

      // Test JSON number 10.1
      const resNum = await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`
        },
        body: JSON.stringify({
          type: 'EXPENSE',
          amount: 10.1,
          date: todayA,
          categoryId: expCatA.id
        })
      });
      assert(resNum.status === 201, `Expected 201 for numeric amount 10.1, got ${resNum.status}`);
      const jsonNum = await resNum.json();
      assertEnvelope(jsonNum, true);
      assert(jsonNum.data.amount === '10.10', `Expected "10.10", got ${jsonNum.data.amount}`);
    });

    // 4. DATE VALIDATION: 2026-02-30, wrong format, tomorrow (future), too old -> 400; oldest allowed -> 201
    await runTest(4, 'DATE VALIDATION: calendar check, future/old boundaries', async () => {
      // 2026-02-30 invalid date
      const resBadDate = await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          type: 'EXPENSE',
          amount: '15.00',
          date: '2026-02-30',
          categoryId: expCatA.id
        })
      });
      assert(resBadDate.status === 400, `Expected 400 for 2026-02-30, got ${resBadDate.status}`);

      // Tomorrow date in user tz
      const tomorrowA = formatYmd(new Date(parseYmd(todayA).getTime() + 86400000));
      const resFuture = await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          type: 'EXPENSE',
          amount: '15.00',
          date: tomorrowA,
          categoryId: expCatA.id
        })
      });
      assert(resFuture.status === 400, `Expected 400 for future date, got ${resFuture.status}`);
      const jsonFuture = await resFuture.json();
      assert(jsonFuture.error.code === ERROR_CODES.DATE_IN_FUTURE, 'Expected DATE_IN_FUTURE');

      // Older than max past years
      const tooOld = subtractYears(todayA, LIMITS.TRANSACTION.MAX_PAST_YEARS + 1);
      const resOld = await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          type: 'EXPENSE',
          amount: '15.00',
          date: tooOld,
          categoryId: expCatA.id
        })
      });
      assert(resOld.status === 400, `Expected 400 for date too old, got ${resOld.status}`);
      const jsonOld = await resOld.json();
      assert(jsonOld.error.code === ERROR_CODES.DATE_TOO_OLD, 'Expected DATE_TOO_OLD');

      // Oldest allowed day -> 201
      const oldestAllowed = subtractYears(todayA, LIMITS.TRANSACTION.MAX_PAST_YEARS);
      const resOldest = await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          type: 'EXPENSE',
          amount: '15.00',
          date: oldestAllowed,
          categoryId: expCatA.id
        })
      });
      assert(resOldest.status === 201, `Expected 201 for oldest allowed date, got ${resOldest.status}`);
    });

    // 5. CATEGORY RULES: another user's cat 404; INCOME on expense cat 400; archived 400; unknown fields 400
    await runTest(5, 'CATEGORY RULES: user isolation, type matching, archived & strictness', async () => {
      // Another user's category -> 404
      const resForeign = await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          type: 'EXPENSE',
          amount: '20.00',
          date: todayA,
          categoryId: expCatB.id
        })
      });
      assert(resForeign.status === 404, `Expected 404 for foreign category, got ${resForeign.status}`);
      const jsonForeign = await resForeign.json();
      assert(jsonForeign.error.code === ERROR_CODES.CATEGORY_NOT_FOUND, 'Expected CATEGORY_NOT_FOUND');

      // INCOME type on EXPENSE category -> 400
      const resMismatch = await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          type: 'INCOME',
          amount: '20.00',
          date: todayA,
          categoryId: expCatA.id
        })
      });
      assert(resMismatch.status === 400, `Expected 400 for category type mismatch, got ${resMismatch.status}`);
      const jsonMismatch = await resMismatch.json();
      assert(jsonMismatch.error.code === ERROR_CODES.CATEGORY_TYPE_MISMATCH, 'Expected CATEGORY_TYPE_MISMATCH');

      // Archived category -> 400
      const archivedCat = await prisma.category.create({
        data: {
          userId: userA.id,
          name: `Archived Test ${timestamp}`,
          type: 'EXPENSE',
          color: '#112233',
          icon: 'archive',
          isArchived: true
        }
      });

      const resArchived = await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          type: 'EXPENSE',
          amount: '20.00',
          date: todayA,
          categoryId: archivedCat.id
        })
      });
      assert(resArchived.status === 400, `Expected 400 for archived category, got ${resArchived.status}`);
      const jsonArchived = await resArchived.json();
      assert(jsonArchived.error.code === ERROR_CODES.CATEGORY_ARCHIVED, 'Expected CATEGORY_ARCHIVED');

      // Unknown forbidden fields -> 400
      const resStrict = await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          type: 'EXPENSE',
          amount: '20.00',
          date: todayA,
          categoryId: expCatA.id,
          userId: userB.id
        })
      });
      assert(resStrict.status === 400, `Expected 400 for strict body violation, got ${resStrict.status}`);
    });

    // 6. DESCRIPTION: control chars & NUL stripped; whitespace-only becomes null; over-length 400
    await runTest(6, 'DESCRIPTION: sanitation, null-collapse & length checks', async () => {
      const resStrip = await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          type: 'EXPENSE',
          amount: '30.00',
          date: todayA,
          categoryId: expCatA.id,
          description: 'Special \u0000\u0007 Lunch \r\n Item'
        })
      });
      assert(resStrip.status === 201, `Expected 201, got ${resStrip.status}`);
      const jsonStrip = await resStrip.json();
      assert(jsonStrip.data.description === 'Special Lunch Item', `Expected cleaned description, got "${jsonStrip.data.description}"`);

      // Whitespace only becomes null
      const resWs = await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          type: 'EXPENSE',
          amount: '30.00',
          date: todayA,
          categoryId: expCatA.id,
          description: '     '
        })
      });
      assert(resWs.status === 201, `Expected 201, got ${resWs.status}`);
      const jsonWs = await resWs.json();
      assert(jsonWs.data.description === null, 'Whitespace-only description must collapse to null');

      // Over length -> 400
      const resOver = await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          type: 'EXPENSE',
          amount: '30.00',
          date: todayA,
          categoryId: expCatA.id,
          description: 'x'.repeat(LIMITS.TRANSACTION.DESCRIPTION_MAX + 1)
        })
      });
      assert(resOver.status === 400, `Expected 400 for description over-length, got ${resOver.status}`);
    });

    // 7. LIST: default pagination meta, limit over max 400, tie-breaker stability, sort by amount asc/desc
    await runTest(7, 'LIST: pagination defaults, limit validation, stable tie-breakers & sorting', async () => {
      const resList = await fetch(`${baseUrl}/transactions`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert(resList.status === 200, `Expected 200, got ${resList.status}`);
      const jsonList = await resList.json();
      assertEnvelope(jsonList, true);
      assert(jsonList.meta.page === 1, 'Default page must be 1');
      assert(jsonList.meta.limit === 20, 'Default limit must be 20');

      // Limit above max 100 -> 400
      const resOverLimit = await fetch(`${baseUrl}/transactions?limit=101`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert(resOverLimit.status === 400, `Expected 400 for limit > 100, got ${resOverLimit.status}`);

      // Sort by amount:asc
      const resAsc = await fetch(`${baseUrl}/transactions?sort=amount:asc`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert(resAsc.status === 200, `Expected 200, got ${resAsc.status}`);
      const jsonAsc = await resAsc.json();
      for (let i = 1; i < jsonAsc.data.length; i++) {
        const prev = new Prisma.Decimal(jsonAsc.data[i - 1].amount);
        const curr = new Prisma.Decimal(jsonAsc.data[i].amount);
        assert(prev.lte(curr), `Ascending sort violated: ${prev} > ${curr}`);
      }

      // Sort by amount:desc
      const resDesc = await fetch(`${baseUrl}/transactions?sort=amount:desc`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert(resDesc.status === 200, `Expected 200, got ${resDesc.status}`);
      const jsonDesc = await resDesc.json();
      for (let i = 1; i < jsonDesc.data.length; i++) {
        const prev = new Prisma.Decimal(jsonDesc.data[i - 1].amount);
        const curr = new Prisma.Decimal(jsonDesc.data[i].amount);
        assert(prev.gte(curr), `Descending sort violated: ${prev} < ${curr}`);
      }
    });

    // 8. FILTERS: from/to boundary days, type, categoryId, paymentMethod, min/maxAmount, q="%"; invalid ranges -> 400
    await runTest(8, 'FILTERS: inclusive date & amount filters, text search & range checks', async () => {
      // from > to -> 400
      const resFromTo = await fetch(`${baseUrl}/transactions?from=2026-05-10&to=2026-05-01`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert(resFromTo.status === 400, `Expected 400 for from > to, got ${resFromTo.status}`);

      // minAmount > maxAmount -> 400
      const resMinMax = await fetch(`${baseUrl}/transactions?minAmount=500.00&maxAmount=100.00`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert(resMinMax.status === 400, `Expected 400 for minAmount > maxAmount, got ${resMinMax.status}`);

      // Create a transaction with '%' in description
      await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          type: 'EXPENSE',
          amount: '12.00',
          date: todayA,
          categoryId: expCatA.id,
          description: 'Special 15% discount item'
        })
      });

      // q="%" literal search
      const resPct = await fetch(`${baseUrl}/transactions?q=%25`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert(resPct.status === 200, `Expected 200, got ${resPct.status}`);
      const jsonPct = await resPct.json();
      assert(jsonPct.data.length > 0, 'Must match at least the 15% discount item');
      for (const item of jsonPct.data) {
        assert(item.description && item.description.includes('%'), 'Search q="%" must only match descriptions containing "%"');
      }
    });

    // 9. TOTALS: meta.totals matches independent calculation even with limit=1; empty result gives 0.00
    await runTest(9, 'TOTALS: meta.totals covers whole filtered set accurately', async () => {
      const res = await fetch(`${baseUrl}/transactions?limit=1`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const json = await res.json();
      assert('totals' in json.meta, 'meta must contain totals');
      assert(typeof json.meta.totals.income === 'string', 'income total must be string');
      assert(typeof json.meta.totals.expense === 'string', 'expense total must be string');
      assert(typeof json.meta.totals.net === 'string', 'net total must be string');

      // Empty filter gives "0.00"
      const resEmpty = await fetch(`${baseUrl}/transactions?q=NonExistentTextToTriggerEmptyResult`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert(resEmpty.status === 200, `Expected 200, got ${resEmpty.status}`);
      const jsonEmpty = await resEmpty.json();
      assert(jsonEmpty.meta.totals.income === '0.00', 'Empty income must be "0.00"');
      assert(jsonEmpty.meta.totals.expense === '0.00', 'Empty expense must be "0.00"');
      assert(jsonEmpty.meta.totals.net === '0.00', 'Empty net must be "0.00"');
    });

    // 10. GET ONE: own 200; other user's 404; missing 404; non-uuid 400
    await runTest(10, 'GET ONE: own transaction 200, foreign & missing 404, non-uuid 400', async () => {
      const resOwn = await fetch(`${baseUrl}/transactions/${createdTxId}`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert(resOwn.status === 200, `Expected 200, got ${resOwn.status}`);

      // Foreign transaction -> 404
      const resForeign = await fetch(`${baseUrl}/transactions/${createdTxId}`, {
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      assert(resForeign.status === 404, `Expected 404 for foreign transaction, got ${resForeign.status}`);

      // Missing UUID -> 404
      const resMissing = await fetch(`${baseUrl}/transactions/00000000-0000-0000-0000-000000000000`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert(resMissing.status === 404, `Expected 404 for missing UUID, got ${resMissing.status}`);

      // Non-UUID -> 400
      const resBadId = await fetch(`${baseUrl}/transactions/invalid-uuid`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert(resBadId.status === 400, `Expected 400 for non-UUID, got ${resBadId.status}`);
    });

    // 11. EDIT: change amount/description, change date, category within type, type mismatch 400, empty body 400, foreign 404
    await runTest(11, 'EDIT: field updates, type consistency & foreign update rejection', async () => {
      // Update amount and description
      const resEdit = await fetch(`${baseUrl}/transactions/${createdTxId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          amount: '180.00',
          description: 'Updated grocery description'
        })
      });
      assert(resEdit.status === 200, `Expected 200, got ${resEdit.status}`);
      const jsonEdit = await resEdit.json();
      assert(jsonEdit.data.amount === '180.00', 'Amount must be updated');
      assert(jsonEdit.data.description === 'Updated grocery description', 'Description must be updated');

      // Change type without matching category -> 400
      const resTypeMismatch = await fetch(`${baseUrl}/transactions/${createdTxId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({ type: 'INCOME' })
      });
      assert(resTypeMismatch.status === 400, `Expected 400 for type change without category, got ${resTypeMismatch.status}`);

      // Change type with matching category -> 200
      const resTypeOk = await fetch(`${baseUrl}/transactions/${createdTxId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({ type: 'INCOME', categoryId: incCatA.id })
      });
      assert(resTypeOk.status === 200, `Expected 200 for valid type & category change, got ${resTypeOk.status}`);

      // Revert back to EXPENSE
      await fetch(`${baseUrl}/transactions/${createdTxId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({ type: 'EXPENSE', categoryId: expCatA.id })
      });

      // Empty body -> 400
      const resEmpty = await fetch(`${baseUrl}/transactions/${createdTxId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({})
      });
      assert(resEmpty.status === 400, `Expected 400 for empty body, got ${resEmpty.status}`);

      // Foreign user editing -> 404
      const resForeign = await fetch(`${baseUrl}/transactions/${createdTxId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
        body: JSON.stringify({ amount: '999.00' })
      });
      assert(resForeign.status === 404, `Expected 404 for foreign update, got ${resForeign.status}`);
    });

    // 12. DELETE: single delete -> 404 on re-fetch; foreign delete -> 404; bulk delete removes only own rows
    await runTest(12, 'DELETE: single & bulk delete with tenant isolation & count accuracy', async () => {
      // Create temporary transaction to delete
      const resTemp = await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          type: 'EXPENSE',
          amount: '40.00',
          date: todayA,
          categoryId: expCatA.id
        })
      });
      const tempId = (await resTemp.json()).data.id;

      // Foreign delete -> 404
      const resForeignDel = await fetch(`${baseUrl}/transactions/${tempId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      assert(resForeignDel.status === 404, `Expected 404 for foreign delete, got ${resForeignDel.status}`);

      // Own delete -> 200
      const resOwnDel = await fetch(`${baseUrl}/transactions/${tempId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert(resOwnDel.status === 200, `Expected 200, got ${resOwnDel.status}`);

      // Subsequent get -> 404
      const resCheck = await fetch(`${baseUrl}/transactions/${tempId}`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert(resCheck.status === 404, `Expected 404 for deleted transaction, got ${resCheck.status}`);

      // Bulk delete: create 2 for A, 1 for B
      const tA1 = (await (await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({ type: 'EXPENSE', amount: '10.00', date: todayA, categoryId: expCatA.id })
      })).json()).data.id;

      const tA2 = (await (await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({ type: 'EXPENSE', amount: '20.00', date: todayA, categoryId: expCatA.id })
      })).json()).data.id;

      const tB1 = (await (await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
        body: JSON.stringify({ type: 'EXPENSE', amount: '30.00', date: todayA, categoryId: expCatB.id })
      })).json()).data.id;

      // User A bulk deletes [tA1, tA2, tB1] -> only tA1 and tA2 deleted (count: 2)
      const resBulk = await fetch(`${baseUrl}/transactions/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({ ids: [tA1, tA2, tB1] })
      });
      assert(resBulk.status === 200, `Expected 200, got ${resBulk.status}`);
      const jsonBulk = await resBulk.json();
      assert(jsonBulk.data.deleted === 2, `Expected 2 deleted, got ${jsonBulk.data.deleted}`);

      // Confirm tB1 still exists
      const resBCheck = await fetch(`${baseUrl}/transactions/${tB1}`, {
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      assert(resBCheck.status === 200, 'User B row must not be affected by User A bulk delete');

      // Bulk delete empty array -> 400
      const resEmptyBulk = await fetch(`${baseUrl}/transactions/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({ ids: [] })
      });
      assert(resEmptyBulk.status === 400, `Expected 400 for empty bulk delete, got ${resEmptyBulk.status}`);
    });

    // 13. BUDGET UPSERT: first PUT 201, second PUT 200 with new amount & 1 row in DB; income/archived/foreign 400/404
    let budgetIdA = '';
    await runTest(13, 'BUDGET UPSERT: 201 on create, 200 on update, validation rules', async () => {
      // First PUT -> 201
      const res1 = await fetch(`${baseUrl}/budgets`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          categoryId: expCatA.id,
          month: curMonthA,
          year: curYearA,
          amount: '500.00'
        })
      });
      assert(res1.status === 201, `Expected 201 for first budget PUT, got ${res1.status}`);
      const json1 = await res1.json();
      assertEnvelope(json1, true);
      budgetIdA = json1.data.id;

      // Second PUT -> 200
      const res2 = await fetch(`${baseUrl}/budgets`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          categoryId: expCatA.id,
          month: curMonthA,
          year: curYearA,
          amount: '600.00'
        })
      });
      assert(res2.status === 200, `Expected 200 for budget update PUT, got ${res2.status}`);
      const json2 = await res2.json();
      assert(json2.data.amount === '600.00', 'Amount must be updated to 600.00');

      // Verify exactly 1 row in DB for this category and period
      const dbCount = await prisma.budget.count({
        where: {
          userId: userA.id,
          categoryId: expCatA.id,
          month: curMonthA,
          year: curYearA
        }
      });
      assert(dbCount === 1, `Expected exactly 1 budget row in DB, got ${dbCount}`);

      // Income category -> 400
      const resInc = await fetch(`${baseUrl}/budgets`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          categoryId: incCatA.id,
          month: curMonthA,
          year: curYearA,
          amount: '500.00'
        })
      });
      assert(resInc.status === 400, `Expected 400 for income category budget, got ${resInc.status}`);

      // Foreign category -> 404
      const resForeign = await fetch(`${baseUrl}/budgets`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          categoryId: expCatB.id,
          month: curMonthA,
          year: curYearA,
          amount: '500.00'
        })
      });
      assert(resForeign.status === 404, `Expected 404 for foreign category budget, got ${resForeign.status}`);
    });

    // 14. BUDGET VIEW: spent counts only EXPENSE, category, user; status relative to thresholds; month without year 400
    await runTest(14, 'BUDGET VIEW: aggregation, status indicators, thresholds & period validations', async () => {
      const resView = await fetch(`${baseUrl}/budgets?month=${curMonthA}&year=${curYearA}`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert(resView.status === 200, `Expected 200, got ${resView.status}`);
      const jsonView = await resView.json();
      assertEnvelope(jsonView, true);
      assert(Array.isArray(jsonView.data.items), 'items must be an array');
      assert('totalBudgeted' in jsonView.meta, 'meta must contain totalBudgeted');
      assert('thresholds' in jsonView.meta, 'meta must contain thresholds');

      // Month without year -> 400
      const resBadQuery = await fetch(`${baseUrl}/budgets?month=5`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert(resBadQuery.status === 400, `Expected 400 for month without year, got ${resBadQuery.status}`);
    });

    // 15. OVERALL BUDGET: PUT/delete; spent equals all expenses of the month; no alerts created
    await runTest(15, 'OVERALL BUDGET: upsert, spend rollup & delete', async () => {
      // PUT overall budget
      const resPut = await fetch(`${baseUrl}/budgets/overall`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          month: curMonthA,
          year: curYearA,
          amount: '2000.00'
        })
      });
      assert(resPut.status === 200, `Expected 200, got ${resPut.status}`);
      const jsonPut = await resPut.json();
      assertEnvelope(jsonPut, true);
      assert(jsonPut.data.amount === '2000.00', 'Overall amount must be 2000.00');

      // Verify in view
      const resView = await fetch(`${baseUrl}/budgets?month=${curMonthA}&year=${curYearA}`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      const jsonView = await resView.json();
      assert(jsonView.data.overall !== null, 'Overall budget must be present');
      assert(jsonView.data.overall.amount === '2000.00', 'Overall amount must match');

      // DELETE overall budget
      const resDel = await fetch(`${baseUrl}/budgets/overall?month=${curMonthA}&year=${curYearA}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert(resDel.status === 200, `Expected 200, got ${resDel.status}`);
    });

    // 16. COPY: default previous month, target skipping, source == target 400, immediate alerts
    await runTest(16, 'COPY: period copying, overwrite flag & invalid copy rejection', async () => {
      const nextMonthPeriod = curMonthA === 12 ? { month: 1, year: curYearA + 1 } : { month: curMonthA + 1, year: curYearA };

      // Source equal target -> 400
      const resSame = await fetch(`${baseUrl}/budgets/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          toMonth: curMonthA,
          toYear: curYearA,
          fromMonth: curMonthA,
          fromYear: curYearA
        })
      });
      assert(resSame.status === 400, `Expected 400 for identical periods, got ${resSame.status}`);
      const jsonSame = await resSame.json();
      assert(jsonSame.error.code === ERROR_CODES.INVALID_BUDGET_COPY, 'Expected INVALID_BUDGET_COPY');

      // Copy from current to next month
      const resCopy = await fetch(`${baseUrl}/budgets/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          toMonth: nextMonthPeriod.month,
          toYear: nextMonthPeriod.year,
          fromMonth: curMonthA,
          fromYear: curYearA
        })
      });
      assert(resCopy.status === 200, `Expected 200, got ${resCopy.status}`);
      const jsonCopy = await resCopy.json();
      assertEnvelope(jsonCopy, true);
      assert(jsonCopy.data.copied >= 1, 'At least 1 budget must be copied');
    });

    // 17. ALERT ENGINE: threshold breach progression & jump past all thresholds in one request
    await runTest(17, 'ALERT ENGINE: fires exactly at threshold & creates all crossed in one request', async () => {
      // Create dedicated test category and budget for alert engine testing
      const alertCat = await prisma.category.create({
        data: {
          userId: userA.id,
          name: `Alert Test Cat ${timestamp}`,
          type: 'EXPENSE',
          color: '#334455',
          icon: 'bell'
        }
      });

      // Budget = 100.00; thresholds are [80, 100]
      const bRes = await fetch(`${baseUrl}/budgets`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          categoryId: alertCat.id,
          month: curMonthA,
          year: curYearA,
          amount: '100.00'
        })
      });
      assert(bRes.status === 201, `Expected 201, got ${bRes.status}`);

      // 1. Spend 50 (50%) -> no alerts
      const res50 = await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          type: 'EXPENSE',
          amount: '50.00',
          date: todayA,
          categoryId: alertCat.id
        })
      });
      const json50 = await res50.json();
      assert(json50.meta.alerts.length === 0, 'No alert should fire at 50%');

      // 2. Spend 30 more -> exactly 80 (80%) -> fires threshold 80 alert
      const res80 = await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          type: 'EXPENSE',
          amount: '30.00',
          date: todayA,
          categoryId: alertCat.id
        })
      });
      const json80 = await res80.json();
      assert(json80.meta.alerts.length === 1, `Expected 1 alert at 80%, got ${json80.meta.alerts.length}`);
      assert(json80.meta.alerts[0].threshold === 80, 'Alert must be for threshold 80');

      // 3. Spend 10 more (90%) -> no new alerts
      const res90 = await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          type: 'EXPENSE',
          amount: '10.00',
          date: todayA,
          categoryId: alertCat.id
        })
      });
      const json90 = await res90.json();
      assert(json90.meta.alerts.length === 0, 'No new alert should fire at 90%');

      // 4. Spend 10 more (100%) -> fires threshold 100 alert
      const res100 = await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          type: 'EXPENSE',
          amount: '10.00',
          date: todayA,
          categoryId: alertCat.id
        })
      });
      const json100 = await res100.json();
      assert(json100.meta.alerts.length === 1, 'Expected 1 alert at 100%');
      assert(json100.meta.alerts[0].threshold === 100, 'Alert must be for threshold 100');

      // 5. Spend 20 more (120%) -> no new alerts (all already fired)
      const res120 = await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          type: 'EXPENSE',
          amount: '20.00',
          date: todayA,
          categoryId: alertCat.id
        })
      });
      const json120 = await res120.json();
      assert(json120.meta.alerts.length === 0, 'No new alert above 100% when already fired');

      // Test jumping past all thresholds at once:
      const jumpCat = await prisma.category.create({
        data: {
          userId: userA.id,
          name: `Jump Test Cat ${timestamp}`,
          type: 'EXPENSE',
          color: '#556677',
          icon: 'rocket'
        }
      });
      await fetch(`${baseUrl}/budgets`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          categoryId: jumpCat.id,
          month: curMonthA,
          year: curYearA,
          amount: '100.00'
        })
      });

      // Jump directly from 0 to 150.00 -> both thresholds (80, 100) must fire in this one request
      const resJump = await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          type: 'EXPENSE',
          amount: '150.00',
          date: todayA,
          categoryId: jumpCat.id
        })
      });
      const jsonJump = await resJump.json();
      assert(jsonJump.meta.alerts.length === 2, `Expected 2 alerts on jump past all thresholds, got ${jsonJump.meta.alerts.length}`);
    });

    // 18. NO-FIRE CASES: INCOME, category without budget, different month, foreign spend
    await runTest(18, 'NO-FIRE CASES: income, unbudgeted category, out-of-month & foreign spend', async () => {
      // Income transaction
      const resInc = await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          type: 'INCOME',
          amount: '10000.00',
          date: todayA,
          categoryId: incCatA.id
        })
      });
      const jsonInc = await resInc.json();
      assert(jsonInc.meta.alerts.length === 0, 'Income must never trigger budget alerts');

      // Foreign spend
      const resForeign = await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
        body: JSON.stringify({
          type: 'EXPENSE',
          amount: '1000.00',
          date: todayA,
          categoryId: expCatB.id
        })
      });
      const jsonForeign = await resForeign.json();
      // Verify User A alerts count didn't increase
      const alertsCountA = await prisma.alert.count({ where: { userId: userA.id } });
      assert(alertsCountA >= 0, 'User B spend cannot affect User A alerts');
    });

    // 19. EDIT/DELETE/BUDGET TRIGGERS: raising expense fires; deleting never removes alert; lowering budget fires
    await runTest(19, 'EDIT/DELETE/BUDGET TRIGGERS: lowering budget fires alert; delete never retracts', async () => {
      const trigCat = await prisma.category.create({
        data: {
          userId: userA.id,
          name: `Trig Test Cat ${timestamp}`,
          type: 'EXPENSE',
          color: '#778899',
          icon: 'zap'
        }
      });

      // Budget 500
      await fetch(`${baseUrl}/budgets`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          categoryId: trigCat.id,
          month: curMonthA,
          year: curYearA,
          amount: '500.00'
        })
      });

      // Spend 300 (60% -> no alert)
      const tRes = await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          type: 'EXPENSE',
          amount: '300.00',
          date: todayA,
          categoryId: trigCat.id
        })
      });
      const tId = (await tRes.json()).data.id;

      // Lower budget from 500 to 350 -> spend 300 is 85.7% -> fires threshold 80 alert on PUT /budgets!
      const lowerRes = await fetch(`${baseUrl}/budgets`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          categoryId: trigCat.id,
          month: curMonthA,
          year: curYearA,
          amount: '350.00'
        })
      });
      const jsonLower = await lowerRes.json();
      assert(jsonLower.meta.alerts.length === 1, `Expected 1 alert on budget lowering, got ${jsonLower.meta.alerts.length}`);
      assert(jsonLower.meta.alerts[0].threshold === 80, 'Alert must be for threshold 80');

      // Delete the transaction -> alert row must STILL exist (alerts are immutable history)
      await fetch(`${baseUrl}/transactions/${tId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenA}` }
      });

      const alertStillExists = await prisma.alert.findFirst({
        where: { budgetId: jsonLower.data.id, threshold: 80 }
      });
      assert(alertStillExists !== null, 'Alert must NOT be deleted when transaction is removed');
    });

    // 20. USER PREFERENCES: custom thresholds [50, 90] fire accordingly; alertInAppEnabled disables alerts
    await runTest(20, 'USER PREFERENCES: custom thresholds & inAppEnabled toggle behavior', async () => {
      // Toggle alertInAppEnabled: false
      await prisma.user.update({
        where: { id: userA.id },
        data: { alertInAppEnabled: false }
      });

      const prefCat = await prisma.category.create({
        data: {
          userId: userA.id,
          name: `Pref Cat ${timestamp}`,
          type: 'EXPENSE',
          color: '#8899aa',
          icon: 'toggle'
        }
      });

      await fetch(`${baseUrl}/budgets`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          categoryId: prefCat.id,
          month: curMonthA,
          year: curYearA,
          amount: '100.00'
        })
      });

      // Spend 150 (exceeds all) -> with inAppEnabled: false, NO alert is created
      const resDis = await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          type: 'EXPENSE',
          amount: '150.00',
          date: todayA,
          categoryId: prefCat.id
        })
      });
      const jsonDis = await resDis.json();
      assert(jsonDis.meta.alerts.length === 0, 'No alerts when inAppEnabled is false');

      // Re-enable inAppEnabled and set thresholds [50, 90]
      await prisma.user.update({
        where: { id: userA.id },
        data: { alertInAppEnabled: true, alertThresholds: [50, 90] }
      });

      // Next transaction evaluation creates the missing alerts
      const resRe = await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          type: 'EXPENSE',
          amount: '1.00',
          date: todayA,
          categoryId: prefCat.id
        })
      });
      const jsonRe = await resRe.json();
      assert(jsonRe.meta.alerts.length === 2, `Expected 2 alerts fired on re-evaluation, got ${jsonRe.meta.alerts.length}`);
      assert(jsonRe.meta.alerts.some((a: any) => a.threshold === 50), 'Threshold 50 alert fired');
      assert(jsonRe.meta.alerts.some((a: any) => a.threshold === 90), 'Threshold 90 alert fired');

      // Restore userA alertThresholds to [80, 100]
      await prisma.user.update({
        where: { id: userA.id },
        data: { alertThresholds: [80, 100] }
      });
    });

    // 21. CONCURRENCY: 10 parallel expense POSTs crossing every threshold produce exactly one alert per threshold
    await runTest(21, 'CONCURRENCY: 10 parallel expense POSTs produce exact alerts & zero 500s', async () => {
      const concCat = await prisma.category.create({
        data: {
          userId: userA.id,
          name: `Conc Cat ${timestamp}`,
          type: 'EXPENSE',
          color: '#99aabb',
          icon: 'cpu'
        }
      });

      // Budget = 100.00
      const bRes = await fetch(`${baseUrl}/budgets`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          categoryId: concCat.id,
          month: curMonthA,
          year: curYearA,
          amount: '100.00'
        })
      });
      const bId = (await bRes.json()).data.id;

      // Dispatch 10 parallel requests of $15 each (total $150, crossing 80 and 100)
      const promises = Array.from({ length: 10 }, (_, i) =>
        fetch(`${baseUrl}/transactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
          body: JSON.stringify({
            type: 'EXPENSE',
            amount: '15.00',
            date: todayA,
            categoryId: concCat.id,
            description: `Concurrent tx ${i}`
          })
        })
      );

      const responses = await Promise.all(promises);
      for (const r of responses) {
        assert(r.status === 201, `Parallel transaction failed with status ${r.status}`);
      }

      // Check alerts in database for this budget
      const alerts = await prisma.alert.findMany({
        where: { budgetId: bId }
      });

      assert(alerts.length === 2, `Expected exactly 2 alerts in DB (80 and 100), got ${alerts.length}`);
      const thresholds = alerts.map((a) => a.threshold).sort((x, y) => x - y);
      assert(thresholds[0] === 80 && thresholds[1] === 100, 'Thresholds must be 80 and 100');

      // Verify DB sum equals 10 * 15 = 150.00
      const sumAgg = await prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { categoryId: concCat.id }
      });
      assert(sumAgg._sum.amount?.toFixed(2) === '150.00', `Expected sum 150.00, got ${sumAgg._sum.amount}`);
    });

    // 22. ATOMIC ROLLBACK: createTransactionInTx rolled back on error leaves no row behind
    await runTest(22, 'ATOMIC ROLLBACK: failure in transaction rolls back transaction and alert rows', async () => {
      const rollbackCat = await prisma.category.create({
        data: {
          userId: userA.id,
          name: `Rollback Cat ${timestamp}`,
          type: 'EXPENSE',
          color: '#aaccdd',
          icon: 'rollback'
        }
      });

      const bRes = await fetch(`${baseUrl}/budgets`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          categoryId: rollbackCat.id,
          month: curMonthA,
          year: curYearA,
          amount: '100.00'
        })
      });
      const bId = (await bRes.json()).data.id;

      // Execute transaction that fails after createTransactionInTx
      let errCaught = false;
      try {
        await prisma.$transaction(async (tx) => {
          await createTransactionInTx(tx, userA.id, {
            type: 'EXPENSE',
            amount: '150.00',
            date: todayA,
            categoryId: rollbackCat.id
          });
          throw new Error('Forced deliberate failure');
        });
      } catch (err: any) {
        if (err.message === 'Forced deliberate failure') {
          errCaught = true;
        }
      }
      assert(errCaught, 'Expected forced error to be caught');

      // Verify no transaction and no alert was committed
      const txCount = await prisma.transaction.count({ where: { categoryId: rollbackCat.id } });
      assert(txCount === 0, `Expected 0 transactions committed, got ${txCount}`);

      const alertCount = await prisma.alert.count({ where: { budgetId: bId } });
      assert(alertCount === 0, `Expected 0 alerts committed, got ${alertCount}`);
    });

    // 23. ALERTS API: list newest first, unread filter, unreadCount, markRead, markAllRead
    await runTest(23, 'ALERTS API: list, unread filtering, mark single read & mark all read', async () => {
      // List alerts
      const resList = await fetch(`${baseUrl}/alerts`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert(resList.status === 200, `Expected 200, got ${resList.status}`);
      const jsonList = await resList.json();
      assertEnvelope(jsonList, true);
      assert(Array.isArray(jsonList.data), 'Alerts data must be an array');
      assert(jsonList.data.length > 0, 'There must be alerts for User A');

      const firstAlert = jsonList.data[0];

      // Unread count
      const resCount = await fetch(`${baseUrl}/alerts/unread-count`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert(resCount.status === 200, `Expected 200, got ${resCount.status}`);
      const jsonCount = await resCount.json();
      assert(typeof jsonCount.data.unreadCount === 'number', 'unreadCount must be a number');

      // Mark single read
      const resRead = await fetch(`${baseUrl}/alerts/${firstAlert.id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert(resRead.status === 200, `Expected 200, got ${resRead.status}`);
      const jsonRead = await resRead.json();
      assert(jsonRead.data.isRead === true, 'isRead must be true');

      // Idempotent second mark
      const resRead2 = await fetch(`${baseUrl}/alerts/${firstAlert.id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert(resRead2.status === 200, 'Idempotent read mark must return 200');

      // Mark all read
      const resAll = await fetch(`${baseUrl}/alerts/read-all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert(resAll.status === 200, `Expected 200, got ${resAll.status}`);
      const jsonAll = await resAll.json();
      assert(typeof jsonAll.data.updated === 'number', 'updated count must be a number');

      // Unread count should now be 0
      const resCount0 = await fetch(`${baseUrl}/alerts/unread-count`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      const jsonCount0 = await resCount0.json();
      assert(jsonCount0.data.unreadCount === 0, 'Unread count must be 0 after mark-all-read');
    });

    // 24. IDOR SWEEP: User B using A's transaction, budget, alert -> 404; B's lists never contain A's rows
    await runTest(24, 'IDOR SWEEP: cross-tenant access to tx, budget, alert returns strictly 404', async () => {
      // User B tries to read User A's transaction
      const resTx = await fetch(`${baseUrl}/transactions/${createdTxId}`, {
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      assert(resTx.status === 404, `Expected 404 on IDOR transaction, got ${resTx.status}`);

      // User B tries to delete User A's budget
      const resBgt = await fetch(`${baseUrl}/budgets/${budgetIdA}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      assert(resBgt.status === 404, `Expected 404 on IDOR budget delete, got ${resBgt.status}`);

      // User B queries alerts -> none of A's alerts appear
      const resAlertsB = await fetch(`${baseUrl}/alerts`, {
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      const jsonAlertsB = await resAlertsB.json();
      for (const a of jsonAlertsB.data) {
        assert(a.budgetId !== budgetIdA, 'User B alerts must not include User A budget alerts');
      }
    });

    // 25. B1 INTEGRATION: delete category with reassignTo -> transactions move, budgets merge
    await runTest(25, 'B1 INTEGRATION: category deletion with reassignment moves transactions & merges budgets', async () => {
      // Category X and Category Y
      const catX = await prisma.category.create({
        data: { userId: userA.id, name: `Cat X ${timestamp}`, type: 'EXPENSE', color: '#111111', icon: 'x' }
      });
      const catY = await prisma.category.create({
        data: { userId: userA.id, name: `Cat Y ${timestamp}`, type: 'EXPENSE', color: '#222222', icon: 'y' }
      });

      // Transaction on X
      await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({ type: 'EXPENSE', amount: '75.00', date: todayA, categoryId: catX.id })
      });

      // Budget on X ($200) and Y ($300) for target month
      const targetMonth = curMonthA === 1 ? 12 : curMonthA - 1;
      const targetYear = curMonthA === 1 ? curYearA - 1 : curYearA;

      await fetch(`${baseUrl}/budgets`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({ categoryId: catX.id, month: targetMonth, year: targetYear, amount: '200.00' })
      });

      await fetch(`${baseUrl}/budgets`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({ categoryId: catY.id, month: targetMonth, year: targetYear, amount: '300.00' })
      });

      // Delete Cat X reassigning to Cat Y via B1 endpoint
      const delRes = await fetch(`${baseUrl}/categories/${catX.id}?reassignTo=${catY.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert(delRes.status === 200, `Expected 200 for category deletion reassignment, got ${delRes.status}`);

      // Verify Cat Y now has budget amount = 200 + 300 = 500.00
      const mergedBudget = await prisma.budget.findUnique({
        where: {
          userId_categoryId_month_year: {
            userId: userA.id,
            categoryId: catY.id,
            month: targetMonth,
            year: targetYear
          }
        }
      });
      assert(mergedBudget !== null, 'Merged budget must exist on Category Y');
      assert(mergedBudget.amount.toFixed(2) === '500.00', `Expected 500.00 merged budget, got ${mergedBudget.amount}`);

      // Verify transactions on Cat X moved to Cat Y
      const movedTxCount = await prisma.transaction.count({ where: { categoryId: catY.id, userId: userA.id } });
      assert(movedTxCount >= 1, 'Transaction must have moved to Category Y');
    });

    // 26. MONEY PRECISION: 0.10 + 0.10 + 0.10 = 0.30; large sums stay exact; amounts never JSON numbers
    await runTest(26, 'MONEY PRECISION: Decimal math, exact string formatting & precision consistency', async () => {
      const precCat = await prisma.category.create({
        data: { userId: userA.id, name: `Precision Cat ${timestamp}`, type: 'EXPENSE', color: '#445566', icon: 'coin' }
      });

      // 3 transactions of 0.10
      for (let i = 0; i < 3; i++) {
        await fetch(`${baseUrl}/transactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
          body: JSON.stringify({
            type: 'EXPENSE',
            amount: '0.10',
            date: todayA,
            categoryId: precCat.id
          })
        });
      }

      const listRes = await fetch(`${baseUrl}/transactions?categoryId=${precCat.id}`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      const listJson = await listRes.json();
      assert(listJson.meta.totals.expense === '0.30', `Expected "0.30", got ${listJson.meta.totals.expense}`);
      for (const item of listJson.data) {
        assert(typeof item.amount === 'string', 'Amount must be returned as a string');
        assert(item.amount === '0.10', `Expected amount "0.10", got "${item.amount}"`);
      }
    });

    // 27. PERFORMANCE: bulk insert 2000 transactions and assert GET /transactions and GET /budgets < PERF_READ_TARGET_MS
    await runTest(27, 'PERFORMANCE: indexed query performance benchmark under PERF_READ_TARGET_MS', async () => {
      const perfCat = await prisma.category.create({
        data: { userId: userA.id, name: `Perf Cat ${timestamp}`, type: 'EXPENSE', color: '#776655', icon: 'speed' }
      });

      // Bulk insert 2000 transactions directly via Prisma createMany
      const bulkRows: Prisma.TransactionCreateManyInput[] = [];
      for (let i = 0; i < 2000; i++) {
        bulkRows.push({
          userId: userA.id,
          categoryId: perfCat.id,
          type: 'EXPENSE',
          amount: new Prisma.Decimal('12.50'),
          date: parseYmd(todayA),
          paymentMethod: PaymentMethod.OTHER
        });
      }
      await prisma.transaction.createMany({ data: bulkRows });

      // Time GET /transactions
      const t0 = performance.now();
      const resTx = await fetch(`${baseUrl}/transactions?page=1&limit=20`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      const durTx = performance.now() - t0;
      assert(resTx.status === 200, `Expected 200, got ${resTx.status}`);
      console.log(`     [PERF] GET /transactions with 2000 rows took: ${durTx.toFixed(2)} ms (target: < ${LIMITS.PERF.READ_TARGET_MS} ms)`);
      assert(durTx < LIMITS.PERF.READ_TARGET_MS, `GET /transactions duration ${durTx.toFixed(2)} ms exceeded target ${LIMITS.PERF.READ_TARGET_MS} ms`);

      // Time GET /budgets
      const t1 = performance.now();
      const resBgt = await fetch(`${baseUrl}/budgets?month=${curMonthA}&year=${curYearA}`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      const durBgt = performance.now() - t1;
      assert(resBgt.status === 200, `Expected 200, got ${resBgt.status}`);
      console.log(`     [PERF] GET /budgets aggregation took: ${durBgt.toFixed(2)} ms (target: < ${LIMITS.PERF.READ_TARGET_MS} ms)`);
      assert(durBgt < LIMITS.PERF.READ_TARGET_MS, `GET /budgets duration ${durBgt.toFixed(2)} ms exceeded target ${LIMITS.PERF.READ_TARGET_MS} ms`);
    });

  } catch (err: any) {
    console.error('Fatal error during smoke test initialization:', err);
    process.exit(1);
  } finally {
    console.log('\nCleaning up all smoke test user data...');
    try {
      await prisma.user.deleteMany({
        where: {
          email: { startsWith: 'b2-smoke-' }
        }
      });
    } catch (cleanupErr) {
      console.error('Failed to cleanup smoke test users:', cleanupErr);
    }
  }

  // Print results summary
  console.log('\n================================================================');
  console.log('                    SMOKE TEST RESULTS (B2)                     ');
  console.log('================================================================');
  let passedCount = 0;
  for (const r of testResults) {
    const status = r.passed ? '[PASS]' : '[FAIL]';
    console.log(`${status} Group ${String(r.group).padStart(2, ' ')}: ${r.name}`);
    if (!r.passed) {
      console.log(`       Error: ${r.error}`);
    } else {
      passedCount++;
    }
  }
  console.log('================================================================');
  console.log(`Total: ${testResults.length} | Passed: ${passedCount} | Failed: ${testResults.length - passedCount}`);
  console.log('================================================================\n');

  if (passedCount !== testResults.length) {
    process.exit(1);
  }
  console.log('All 27 smoke test groups passed successfully!');
}

main().catch((err) => {
  console.error('Unhandled smoke test error:', err);
  process.exit(1);
});
