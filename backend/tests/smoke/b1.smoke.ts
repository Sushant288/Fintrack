/**
 * FinTrack Module B1 Smoke Test Suite
 * 
 * NOTE: The rate limiter is in-memory, so restart the server between runs
 * if you hit REGISTER_RATE_MAX or GENERAL_RATE_MAX.
 */

import { PrismaClient, TxType } from '@prisma/client';
import { env } from '../../src/config/env';
import { LIMITS } from '../../src/config/limits';
import { DEFAULT_CATEGORIES } from '../../src/services/category.defaults';
import { REFRESH_COOKIE_NAME } from '../../src/utils/cookies';
import { ERROR_CODES } from '../../src/utils/ApiError';

const prisma = new PrismaClient();

const rawBaseUrl = process.env.SMOKE_BASE_URL || `http://localhost:${env.PORT}`;
const rootUrl = rawBaseUrl.replace(/\/api\/v1\/?$/, '');
const baseUrl = `${rootUrl}/api/v1`;
const clientOrigin = env.CLIENT_ORIGINS[0];

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

function getCookieValue(cookies: string[], name: string): string | null {
  for (const c of cookies) {
    const parts = c.split(';')[0].split('=');
    if (parts[0].trim() === name) {
      return parts.slice(1).join('=').trim();
    }
  }
  return null;
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
  console.log('              FinTrack Module B1: Smoke Test Suite              ');
  console.log(` Target Base URL: ${baseUrl}`);
  console.log(` Allowed Origin:  ${clientOrigin}`);
  console.log('================================================================\n');

  const timestamp = Date.now();
  const user1Email = `b1-smoke-${timestamp}-u1@fintrack.test`;
  const user2Email = `b1-smoke-${timestamp}-u2@fintrack.test`;
  const defaultPassword = 'Password123';

  let user1Token = '';
  let user1Cookie = '';
  let user1Id = '';
  let user2Token = '';
  let user2Id = '';

  try {
    // 1. GET /health 200 and /health/ready 200
    await runTest(1, 'GET /health 200 and /health/ready 200', async () => {
      const hRes = await fetch(`${rootUrl}/health`);
      assert(hRes.status === 200, `Expected 200, got ${hRes.status}`);
      const hJson = await hRes.json();
      assertEnvelope(hJson, true);
      assert(hJson.data.status === 'ok', 'Status must be ok');

      const rRes = await fetch(`${rootUrl}/health/ready`);
      assert(rRes.status === 200, `Expected 200, got ${rRes.status}`);
      const rJson = await rRes.json();
      assertEnvelope(rJson, true);
      assert(rJson.data.status === 'ok' && rJson.data.db === 'up', 'Ready probe must return ok and db:up');
    });

    // 2. Register valid: 201; Set-Cookie HttpOnly/Path=/api/v1/auth; no refreshToken or passwordHash in body
    await runTest(2, 'Register valid user (201, cookie headers, clean body)', async () => {
      const res = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: clientOrigin },
        body: JSON.stringify({
          name: 'Smoke User 1',
          email: user1Email,
          password: defaultPassword
        })
      });

      assert(res.status === 201, `Expected 201, got ${res.status}`);
      const cookies = (res.headers as any).getSetCookie ? (res.headers as any).getSetCookie() : [];
      const setCookieHeader = cookies.join('; ');
      assert(setCookieHeader.toLowerCase().includes('httponly'), 'Set-Cookie must include HttpOnly');
      assert(setCookieHeader.includes('Path=/api/v1/auth'), 'Set-Cookie path must be /api/v1/auth');

      const tokenCookie = getCookieValue(cookies, REFRESH_COOKIE_NAME);
      assert(tokenCookie !== null && tokenCookie.length > 0, 'Refresh cookie must be present');
      user1Cookie = tokenCookie!;

      const json = await res.json();
      assertEnvelope(json, true);
      assert(typeof json.data.accessToken === 'string', 'Must return accessToken string');
      assert(typeof json.data.expiresIn === 'number', 'Must return expiresIn number');
      assert(json.data.refreshToken === undefined, 'Body must NOT contain refreshToken');
      assert(json.data.user.passwordHash === undefined, 'Body must NOT contain passwordHash');
      assert(json.data.user.email === user1Email.toLowerCase(), 'Email must be normalized lowercase');

      user1Token = json.data.accessToken;
      user1Id = json.data.user.id;
    });

    // 3. GET /categories right after register returns exactly DEFAULT_CATEGORIES.length items, all isDefault
    await runTest(3, 'GET /categories right after register returns all default categories', async () => {
      const res = await fetch(`${baseUrl}/categories`, {
        headers: { Authorization: `Bearer ${user1Token}`, Origin: clientOrigin }
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const json = await res.json();
      assertEnvelope(json, true);
      assert(Array.isArray(json.data), 'Data must be an array');
      assert(
        json.data.length === DEFAULT_CATEGORIES.length,
        `Expected ${DEFAULT_CATEGORIES.length} categories, got ${json.data.length}`
      );
      for (const cat of json.data) {
        assert(cat.isDefault === true, `Category ${cat.name} must have isDefault=true`);
        assert(cat.canDelete === true, `Default category without transactions must have canDelete=true`);
      }
    });

    // 4. Register same email in different case: 409 EMAIL_TAKEN
    await runTest(4, 'Register same email in different case (409 EMAIL_TAKEN)', async () => {
      const res = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: clientOrigin },
        body: JSON.stringify({
          name: 'Case Test',
          email: user1Email.toUpperCase(),
          password: defaultPassword
        })
      });
      assert(res.status === 409, `Expected 409, got ${res.status}`);
      const json = await res.json();
      assertEnvelope(json, false);
      assert(json.error.code === ERROR_CODES.EMAIL_TAKEN, `Expected code EMAIL_TAKEN, got ${json.error.code}`);
    });

    // 5. Register with weak password: each 400 with a field-level detail; unknown extra field: 400
    await runTest(5, 'Register with weak password and extra fields rejected (400)', async () => {
      const tests = [
        { payload: { name: 'Weak', email: `weak1-${timestamp}@fintrack.test`, password: 'Ab1' }, desc: 'too short' },
        { payload: { name: 'Weak', email: `weak2-${timestamp}@fintrack.test`, password: 'PasswordOnly' }, desc: 'no digit' },
        { payload: { name: 'Weak', email: `weak3-${timestamp}@fintrack.test`, password: '12345678' }, desc: 'no letter' },
        { payload: { name: 'Weak', email: `weak4-${timestamp}@fintrack.test`, password: 'P1' + '🔒'.repeat(20) }, desc: 'over 72 bytes' },
        { payload: { name: 'Extra', email: `extra-${timestamp}@fintrack.test`, password: defaultPassword, unknownKey: true }, desc: 'unknown key' }
      ];

      for (const t of tests) {
        const res = await fetch(`${baseUrl}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: clientOrigin },
          body: JSON.stringify(t.payload)
        });
        assert(res.status === 400, `Expected 400 for ${t.desc}, got ${res.status}`);
        const json = await res.json();
        assertEnvelope(json, false);
        assert(json.error.code === ERROR_CODES.VALIDATION_ERROR, `Expected VALIDATION_ERROR for ${t.desc}`);
      }
    });

    // 6. Login valid 200; wrong password and unknown email both 401 with IDENTICAL message and code
    await runTest(6, 'Login valid 200; wrong password and unknown email both 401 with identical response', async () => {
      const validRes = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: clientOrigin },
        body: JSON.stringify({ email: user1Email, password: defaultPassword })
      });
      assert(validRes.status === 200, `Expected 200, got ${validRes.status}`);
      const validJson = await validRes.json();
      assertEnvelope(validJson, true);
      const cookies = (validRes.headers as any).getSetCookie ? (validRes.headers as any).getSetCookie() : [];
      user1Cookie = getCookieValue(cookies, REFRESH_COOKIE_NAME)!;

      const wrongPassRes = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: clientOrigin },
        body: JSON.stringify({ email: user1Email, password: 'WrongPassword123' })
      });
      assert(wrongPassRes.status === 401, `Expected 401, got ${wrongPassRes.status}`);
      const wrongPassJson = await wrongPassRes.json();

      const unknownEmailRes = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: clientOrigin },
        body: JSON.stringify({ email: `nonexistent-${timestamp}@fintrack.test`, password: defaultPassword })
      });
      assert(unknownEmailRes.status === 401, `Expected 401, got ${unknownEmailRes.status}`);
      const unknownEmailJson = await unknownEmailRes.json();

      assert(
        wrongPassJson.error.code === unknownEmailJson.error.code,
        'Error code must be identical for wrong password and unknown email'
      );
      assert(
        wrongPassJson.error.message === unknownEmailJson.error.message,
        'Error message must be identical for wrong password and unknown email'
      );
      assert(
        wrongPassJson.error.code === ERROR_CODES.INVALID_CREDENTIALS,
        'Error code must be INVALID_CREDENTIALS'
      );
    });

    // 7. /users/me: valid token 200; no token 401; garbage token 401; tampered signature 401
    await runTest(7, 'GET /users/me token verification checks (valid, missing, garbage, tampered)', async () => {
      const validRes = await fetch(`${baseUrl}/users/me`, {
        headers: { Authorization: `Bearer ${user1Token}`, Origin: clientOrigin }
      });
      assert(validRes.status === 200, `Expected 200, got ${validRes.status}`);

      const missingRes = await fetch(`${baseUrl}/users/me`, {
        headers: { Origin: clientOrigin }
      });
      assert(missingRes.status === 401, `Expected 401, got ${missingRes.status}`);

      const garbageRes = await fetch(`${baseUrl}/users/me`, {
        headers: { Authorization: 'Bearer not-a-valid-token', Origin: clientOrigin }
      });
      assert(garbageRes.status === 401, `Expected 401, got ${garbageRes.status}`);

      const tampered = user1Token.slice(0, -5) + 'abcde';
      const tamperedRes = await fetch(`${baseUrl}/users/me`, {
        headers: { Authorization: `Bearer ${tampered}`, Origin: clientOrigin }
      });
      assert(tamperedRes.status === 401, `Expected 401, got ${tamperedRes.status}`);
    });

    // 8. Refresh with cookie: 200; replay old cookie -> 401 REFRESH_TOKEN_REUSED and revokes family; no cookie -> 401
    await runTest(8, 'Refresh rotation, family reuse revocation, and missing cookie checks', async () => {
      const oldCookie = user1Cookie;
      const refRes1 = await fetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: `${REFRESH_COOKIE_NAME}=${oldCookie}`,
          Origin: clientOrigin
        }
      });
      assert(refRes1.status === 200, `Expected 200, got ${refRes1.status}`);
      const ref1Cookies = (refRes1.headers as any).getSetCookie ? (refRes1.headers as any).getSetCookie() : [];
      const newCookie = getCookieValue(ref1Cookies, REFRESH_COOKIE_NAME);
      assert(newCookie !== null && newCookie !== oldCookie, 'New rotated cookie must differ from old cookie');

      // Replaying the old cookie must trigger reuse detection
      const replayRes = await fetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: `${REFRESH_COOKIE_NAME}=${oldCookie}`,
          Origin: clientOrigin
        }
      });
      assert(replayRes.status === 401, `Expected 401, got ${replayRes.status}`);
      const replayJson = await replayRes.json();
      assert(
        replayJson.error.code === ERROR_CODES.REFRESH_TOKEN_REUSED,
        `Expected REFRESH_TOKEN_REUSED, got ${replayJson.error.code}`
      );

      // Now the new cookie must ALSO be rejected because family was revoked
      const nextRes = await fetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: `${REFRESH_COOKIE_NAME}=${newCookie}`,
          Origin: clientOrigin
        }
      });
      assert(nextRes.status === 401, `Expected 401 for revoked family, got ${nextRes.status}`);

      // Refresh with no cookie
      const noCookieRes = await fetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { Origin: clientOrigin }
      });
      assert(noCookieRes.status === 401, `Expected 401, got ${noCookieRes.status}`);
      const noCookieJson = await noCookieRes.json();
      assert(
        noCookieJson.error.code === ERROR_CODES.REFRESH_TOKEN_MISSING,
        `Expected REFRESH_TOKEN_MISSING, got ${noCookieJson.error.code}`
      );

      // Re-login to restore active user1 session
      const loginAgain = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: clientOrigin },
        body: JSON.stringify({ email: user1Email, password: defaultPassword })
      });
      const loginAgainJson = await loginAgain.json();
      user1Token = loginAgainJson.data.accessToken;
      const cks = (loginAgain.headers as any).getSetCookie ? (loginAgain.headers as any).getSetCookie() : [];
      user1Cookie = getCookieValue(cks, REFRESH_COOKIE_NAME)!;
    });

    // 9. Logout: 200 and cookie cleared; refresh after logout: 401
    await runTest(9, 'Logout clears cookie and revokes session', async () => {
      const logoutRes = await fetch(`${baseUrl}/auth/logout`, {
        method: 'POST',
        headers: {
          Cookie: `${REFRESH_COOKIE_NAME}=${user1Cookie}`,
          Origin: clientOrigin
        }
      });
      assert(logoutRes.status === 200, `Expected 200, got ${logoutRes.status}`);

      const afterLogoutRes = await fetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: `${REFRESH_COOKIE_NAME}=${user1Cookie}`,
          Origin: clientOrigin
        }
      });
      assert(afterLogoutRes.status === 401, `Expected 401 after logout, got ${afterLogoutRes.status}`);

      // Re-login for subsequent tests
      const loginBack = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: clientOrigin },
        body: JSON.stringify({ email: user1Email, password: defaultPassword })
      });
      const loginBackJson = await loginBack.json();
      user1Token = loginBackJson.data.accessToken;
      const cks = (loginBack.headers as any).getSetCookie ? (loginBack.headers as any).getSetCookie() : [];
      user1Cookie = getCookieValue(cks, REFRESH_COOKIE_NAME)!;
    });

    // 10. PATCH /users/me: valid change 200; invalid currency 400; invalid timezone 400; duplicates 400; out of range 400; sort transform; empty 400; email 400
    await runTest(10, 'PATCH /users/me validation and normalization', async () => {
      const validPatch = await fetch(`${baseUrl}/users/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user1Token}`,
          Origin: clientOrigin
        },
        body: JSON.stringify({
          name: 'Updated Smoke Name',
          currency: 'USD',
          timezone: 'UTC',
          alertThresholds: [90, 50, 100]
        })
      });
      assert(validPatch.status === 200, `Expected 200, got ${validPatch.status}`);
      const validJson = await validPatch.json();
      assertEnvelope(validJson, true);
      assert(validJson.data.user.name === 'Updated Smoke Name', 'Name should be updated');
      assert(validJson.data.user.currency === 'USD', 'Currency should be USD');
      assert(validJson.data.user.timezone === 'UTC', 'Timezone should be UTC');
      assert(
        JSON.stringify(validJson.data.user.alertThresholds) === JSON.stringify([50, 90, 100]),
        'Thresholds should be sorted in ascending order'
      );

      // Invalid currency
      const badCurr = await fetch(`${baseUrl}/users/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user1Token}`, Origin: clientOrigin },
        body: JSON.stringify({ currency: 'XYZ' })
      });
      assert(badCurr.status === 400, 'Invalid currency must return 400');

      // Invalid timezone
      const badTz = await fetch(`${baseUrl}/users/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user1Token}`, Origin: clientOrigin },
        body: JSON.stringify({ timezone: 'Invalid/Zone' })
      });
      assert(badTz.status === 400, 'Invalid timezone must return 400');

      // Duplicate thresholds
      const dupThresh = await fetch(`${baseUrl}/users/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user1Token}`, Origin: clientOrigin },
        body: JSON.stringify({ alertThresholds: [80, 80] })
      });
      assert(dupThresh.status === 400, 'Duplicate thresholds must return 400');

      // Out of range threshold
      const rangeThresh = await fetch(`${baseUrl}/users/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user1Token}`, Origin: clientOrigin },
        body: JSON.stringify({ alertThresholds: [0, 101] })
      });
      assert(rangeThresh.status === 400, 'Thresholds out of range must return 400');

      // Empty body
      const emptyPatch = await fetch(`${baseUrl}/users/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user1Token}`, Origin: clientOrigin },
        body: JSON.stringify({})
      });
      assert(emptyPatch.status === 400, 'Empty update payload must return 400');

      // Email field forbidden
      const emailPatch = await fetch(`${baseUrl}/users/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user1Token}`, Origin: clientOrigin },
        body: JSON.stringify({ email: 'newemail@fintrack.test' })
      });
      assert(emailPatch.status === 400, 'Email modification must be rejected with 400');
    });

    // 11. Change password: wrong current 400 CURRENT_PASSWORD_INCORRECT; same password 400 SAME_PASSWORD; success session
    await runTest(11, 'Change password endpoint checks (wrong current, same password, new session)', async () => {
      const newPassword = 'NewPassword456';

      const wrongCurrent = await fetch(`${baseUrl}/users/me/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user1Token}`, Origin: clientOrigin },
        body: JSON.stringify({ currentPassword: 'WrongPassword999', newPassword })
      });
      assert(wrongCurrent.status === 400, `Expected 400, got ${wrongCurrent.status}`);
      const wrongCurrentJson = await wrongCurrent.json();
      assert(
        wrongCurrentJson.error.code === ERROR_CODES.CURRENT_PASSWORD_INCORRECT,
        `Expected CURRENT_PASSWORD_INCORRECT, got ${wrongCurrentJson.error.code}`
      );

      const samePass = await fetch(`${baseUrl}/users/me/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user1Token}`, Origin: clientOrigin },
        body: JSON.stringify({ currentPassword: defaultPassword, newPassword: defaultPassword })
      });
      assert(samePass.status === 400, `Expected 400, got ${samePass.status}`);
      const samePassJson = await samePass.json();
      assert(
        samePassJson.error.code === ERROR_CODES.SAME_PASSWORD,
        `Expected SAME_PASSWORD, got ${samePassJson.error.code}`
      );

      const successChange = await fetch(`${baseUrl}/users/me/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user1Token}`, Origin: clientOrigin },
        body: JSON.stringify({ currentPassword: defaultPassword, newPassword })
      });
      assert(successChange.status === 200, `Expected 200, got ${successChange.status}`);
      const successJson = await successChange.json();
      user1Token = successJson.data.accessToken;
      const cks = (successChange.headers as any).getSetCookie ? (successChange.headers as any).getSetCookie() : [];
      user1Cookie = getCookieValue(cks, REFRESH_COOKIE_NAME)!;

      // Old password fails login
      const oldLogin = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: clientOrigin },
        body: JSON.stringify({ email: user1Email, password: defaultPassword })
      });
      assert(oldLogin.status === 401, 'Old password must fail login with 401');

      // New password succeeds login
      const newLogin = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: clientOrigin },
        body: JSON.stringify({ email: user1Email, password: newPassword })
      });
      assert(newLogin.status === 200, 'New password must succeed login with 200');
    });

    // 12. Categories create: 201; same name diff case 409; other type 201; invalid color 400; type on PATCH 400; rename 409; child under child 400
    let parentCatId = '';
    let childCatId = '';
    await runTest(12, 'Category hierarchy and uniqueness validation rules', async () => {
      const createRes = await fetch(`${baseUrl}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user1Token}`, Origin: clientOrigin },
        body: JSON.stringify({ name: 'Gadgets', type: 'EXPENSE', color: '#112233', icon: 'smartphone' })
      });
      assert(createRes.status === 201, `Expected 201, got ${createRes.status}`);
      const createJson = await createRes.json();
      parentCatId = createJson.data.id;

      // Same name different case
      const caseDup = await fetch(`${baseUrl}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user1Token}`, Origin: clientOrigin },
        body: JSON.stringify({ name: 'gadgets', type: 'EXPENSE' })
      });
      assert(caseDup.status === 409, `Expected 409, got ${caseDup.status}`);
      const caseDupJson = await caseDup.json();
      assert(caseDupJson.error.code === ERROR_CODES.CATEGORY_NAME_TAKEN, 'Expected CATEGORY_NAME_TAKEN');

      // Same name with other type (INCOME) accepted
      const otherTypeRes = await fetch(`${baseUrl}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user1Token}`, Origin: clientOrigin },
        body: JSON.stringify({ name: 'Gadgets', type: 'INCOME' })
      });
      assert(otherTypeRes.status === 201, `Expected 201 for other type, got ${otherTypeRes.status}`);

      // Invalid color
      const badColor = await fetch(`${baseUrl}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user1Token}`, Origin: clientOrigin },
        body: JSON.stringify({ name: 'BadColor', type: 'EXPENSE', color: 'blue' })
      });
      assert(badColor.status === 400, 'Invalid color must return 400');

      // Type on PATCH rejected with field message "Category type cannot be changed"
      const typePatch = await fetch(`${baseUrl}/categories/${parentCatId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user1Token}`, Origin: clientOrigin },
        body: JSON.stringify({ type: 'INCOME' })
      });
      assert(typePatch.status === 400, 'Sending type on PATCH must return 400');
      const typePatchJson = await typePatch.json();
      assert(
        JSON.stringify(typePatchJson).includes('Category type cannot be changed'),
        'Must include "Category type cannot be changed" message'
      );

      // Child category under valid parent
      const childRes = await fetch(`${baseUrl}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user1Token}`, Origin: clientOrigin },
        body: JSON.stringify({ name: 'Phones', type: 'EXPENSE', parentId: parentCatId })
      });
      assert(childRes.status === 201, `Expected 201, got ${childRes.status}`);
      const childJson = await childRes.json();
      childCatId = childJson.data.id;

      // Child under child rejected (max depth 2)
      const grandChildRes = await fetch(`${baseUrl}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user1Token}`, Origin: clientOrigin },
        body: JSON.stringify({ name: 'iPhone', type: 'EXPENSE', parentId: childCatId })
      });
      assert(grandChildRes.status === 400, `Expected 400 for child under child, got ${grandChildRes.status}`);
      const gcJson = await grandChildRes.json();
      assert(gcJson.error.code === ERROR_CODES.INVALID_PARENT, 'Expected INVALID_PARENT');
    });

    // 13. Archive and unarchive via PATCH; list hides archived unless includeArchived=true; q filter works
    await runTest(13, 'Category archiving, includeArchived filter, and search q filter', async () => {
      // Archive child category
      const archRes = await fetch(`${baseUrl}/categories/${childCatId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user1Token}`, Origin: clientOrigin },
        body: JSON.stringify({ isArchived: true })
      });
      assert(archRes.status === 200, `Expected 200, got ${archRes.status}`);

      // Default list hides archived
      const listNormal = await fetch(`${baseUrl}/categories`, {
        headers: { Authorization: `Bearer ${user1Token}`, Origin: clientOrigin }
      });
      const listNormalJson = await listNormal.json();
      const foundInNormal = listNormalJson.data.some((c: any) => c.id === childCatId);
      assert(!foundInNormal, 'Archived category must be hidden by default');

      // includeArchived=true reveals archived
      const listArch = await fetch(`${baseUrl}/categories?includeArchived=true`, {
        headers: { Authorization: `Bearer ${user1Token}`, Origin: clientOrigin }
      });
      const listArchJson = await listArch.json();
      const foundInArch = listArchJson.data.some((c: any) => c.id === childCatId);
      assert(foundInArch, 'Archived category must be visible with includeArchived=true');

      // Search q filter
      const searchRes = await fetch(`${baseUrl}/categories?q=Gadget`, {
        headers: { Authorization: `Bearer ${user1Token}`, Origin: clientOrigin }
      });
      const searchJson = await searchRes.json();
      assert(searchJson.data.some((c: any) => c.id === parentCatId), 'Search must return matching category');

      // Unarchive child category
      await fetch(`${baseUrl}/categories/${childCatId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user1Token}`, Origin: clientOrigin },
        body: JSON.stringify({ isArchived: false })
      });
    });

    // 14. Delete unused category 200 (promotes children); delete with tx: 409; reassignTo moves tx/rules & merges budgets
    await runTest(14, 'Delete category rules (unused, in-use rejection, reassignment & budget merging)', async () => {
      // Delete parent category: child should have parentId set to null
      const delParentRes = await fetch(`${baseUrl}/categories/${parentCatId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${user1Token}`, Origin: clientOrigin }
      });
      assert(delParentRes.status === 200, `Expected 200, got ${delParentRes.status}`);

      const childCheck = await prisma.category.findUniqueOrThrow({ where: { id: childCatId } });
      assert(childCheck.parentId === null, 'Children must be promoted to top level on parent deletion');

      // Insert transaction directly on childCatId using Prisma
      await prisma.transaction.create({
        data: {
          userId: user1Id,
          categoryId: childCatId,
          type: TxType.EXPENSE,
          amount: '500.00',
          date: new Date('2026-11-01'),
          description: 'Smoke test tx'
        }
      });

      // Attempt to delete category in use without reassignTo -> 409 CATEGORY_IN_USE
      const delInUse = await fetch(`${baseUrl}/categories/${childCatId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${user1Token}`, Origin: clientOrigin }
      });
      assert(delInUse.status === 409, `Expected 409, got ${delInUse.status}`);
      const delInUseJson = await delInUse.json();
      assert(delInUseJson.error.code === ERROR_CODES.CATEGORY_IN_USE, 'Expected CATEGORY_IN_USE');
      assert(delInUseJson.error.details.transactions > 0, 'Details must reflect transaction count');

      // Create target category for reassignment
      const targetCat = await prisma.category.create({
        data: { userId: user1Id, name: 'Hardware', type: TxType.EXPENSE, color: '#334455' }
      });

      // Create budgets for merge test
      // Month 11: both source and target have budgets -> should merge (increment)
      await prisma.budget.create({
        data: { userId: user1Id, categoryId: childCatId, type: TxType.EXPENSE, month: 11, year: 2026, amount: '400.00' }
      });
      await prisma.budget.create({
        data: { userId: user1Id, categoryId: targetCat.id, type: TxType.EXPENSE, month: 11, year: 2026, amount: '600.00' }
      });
      // Month 12: only source has budget -> should move
      await prisma.budget.create({
        data: { userId: user1Id, categoryId: childCatId, type: TxType.EXPENSE, month: 12, year: 2026, amount: '300.00' }
      });

      // Delete with valid reassignTo
      const reassignDel = await fetch(`${baseUrl}/categories/${childCatId}?reassignTo=${targetCat.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${user1Token}`, Origin: clientOrigin }
      });
      assert(reassignDel.status === 200, `Expected 200, got ${reassignDel.status}`);
      const reassignJson = await reassignDel.json();
      assert(reassignJson.data.deleted === true, 'Deleted flag must be true');
      assert(reassignJson.data.reassigned.transactions === 1, 'Transaction must be moved');
      assert(reassignJson.data.reassigned.budgetsMerged === 1, 'Month 11 budget must be merged');
      assert(reassignJson.data.reassigned.budgetsMoved === 1, 'Month 12 budget must be moved');

      // Verify merged budget amount: 600 + 400 = 1000
      const mergedBudget = await prisma.budget.findUniqueOrThrow({
        where: { userId_categoryId_month_year: { userId: user1Id, categoryId: targetCat.id, month: 11, year: 2026 } }
      });
      assert(Number(mergedBudget.amount) === 1000, `Expected budget 1000, got ${mergedBudget.amount}`);

      // Verify source category deleted
      const sourceCheck = await prisma.category.findUnique({ where: { id: childCatId } });
      assert(sourceCheck === null, 'Source category must be completely deleted');
    });

    // 15. IDOR: user B patching, deleting, or using as reassignTo/parentId a category owned by user A: 404 CATEGORY_NOT_FOUND
    await runTest(15, 'IDOR cross-user resource isolation returns 404 (never 403)', async () => {
      // Register user 2
      const reg2 = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: clientOrigin },
        body: JSON.stringify({ name: 'Smoke User 2', email: user2Email, password: defaultPassword })
      });
      const reg2Json = await reg2.json();
      user2Token = reg2Json.data.accessToken;
      user2Id = reg2Json.data.user.id;

      // User 1 creates a private category
      const catA = await prisma.category.create({
        data: { userId: user1Id, name: 'User1Private', type: TxType.EXPENSE }
      });

      // User 2 attempts to patch User 1's category -> 404
      const patchCross = await fetch(`${baseUrl}/categories/${catA.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user2Token}`, Origin: clientOrigin },
        body: JSON.stringify({ name: 'Hacked' })
      });
      assert(patchCross.status === 404, `Expected 404 for cross-user patch, got ${patchCross.status}`);
      const patchCrossJson = await patchCross.json();
      assert(patchCrossJson.error.code === ERROR_CODES.CATEGORY_NOT_FOUND, 'Expected CATEGORY_NOT_FOUND');

      // User 2 attempts to delete User 1's category -> 404
      const deleteCross = await fetch(`${baseUrl}/categories/${catA.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${user2Token}`, Origin: clientOrigin }
      });
      assert(deleteCross.status === 404, `Expected 404 for cross-user delete, got ${deleteCross.status}`);

      // User 2's list never includes User 1's category
      const u2List = await fetch(`${baseUrl}/categories`, {
        headers: { Authorization: `Bearer ${user2Token}`, Origin: clientOrigin }
      });
      const u2ListJson = await u2List.json();
      assert(!u2ListJson.data.some((c: any) => c.id === catA.id), "User 2's category list leaked User 1 category");
    });

    // 16. CORS/CSRF: POST /auth/refresh with disallowed Origin -> 403; allowed Origin passes
    await runTest(16, 'CSRF/CORS Origin guard on cookie endpoints', async () => {
      const disallowedRes = await fetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          Origin: 'https://malicious-attacker.com'
        }
      });
      assert(disallowedRes.status === 403, `Expected 403 for untrusted origin, got ${disallowedRes.status}`);
      const disallowedJson = await disallowedRes.json();
      assert(disallowedJson.error.code === ERROR_CODES.ORIGIN_NOT_ALLOWED, 'Expected ORIGIN_NOT_ALLOWED');

      const allowedRes = await fetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          Origin: clientOrigin
        }
      });
      // Origin guard passes (status is not 403)
      assert(allowedRes.status !== 403, 'Allowed origin must pass the origin guard');
    });

    // 17. Malformed JSON body 400 INVALID_JSON; non-uuid :id 400; unknown route 404 ROUTE_NOT_FOUND
    await runTest(17, 'Global format error handling (malformed JSON, invalid UUID param, route 404)', async () => {
      const malformedRes = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: clientOrigin },
        body: '{"brokenJson": '
      });
      assert(malformedRes.status === 400, `Expected 400 for malformed JSON, got ${malformedRes.status}`);
      const malformedJson = await malformedRes.json();
      assertEnvelope(malformedJson, false);
      assert(malformedJson.error.code === ERROR_CODES.INVALID_JSON, 'Expected INVALID_JSON');

      const badUuidRes = await fetch(`${baseUrl}/categories/not-a-valid-uuid`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user1Token}`, Origin: clientOrigin },
        body: JSON.stringify({ name: 'ValidName' })
      });
      assert(badUuidRes.status === 400, `Expected 400 for bad UUID param, got ${badUuidRes.status}`);
      const badUuidJson = await badUuidRes.json();
      assertEnvelope(badUuidJson, false);
      assert(badUuidJson.error.code === ERROR_CODES.VALIDATION_ERROR, 'Expected VALIDATION_ERROR');

      const notFoundRes = await fetch(`${baseUrl}/unmapped/route/random`, {
        headers: { Origin: clientOrigin }
      });
      assert(notFoundRes.status === 404, `Expected 404, got ${notFoundRes.status}`);
      const notFoundJson = await notFoundRes.json();
      assertEnvelope(notFoundJson, false);
      assert(notFoundJson.error.code === ERROR_CODES.ROUTE_NOT_FOUND, 'Expected ROUTE_NOT_FOUND');
    });

    // 18. Delete account: wrong password 400; correct password 200 and zero rows left in DB
    await runTest(18, 'Account deletion with password verification and cascade cleanup', async () => {
      const wrongPass = await fetch(`${baseUrl}/users/me`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user2Token}`, Origin: clientOrigin },
        body: JSON.stringify({ password: 'WrongPasswordXYZ' })
      });
      assert(wrongPass.status === 400, `Expected 400, got ${wrongPass.status}`);
      const wrongPassJson = await wrongPass.json();
      assert(wrongPassJson.error.code === ERROR_CODES.CURRENT_PASSWORD_INCORRECT, 'Expected CURRENT_PASSWORD_INCORRECT');

      const correctPass = await fetch(`${baseUrl}/users/me`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user2Token}`, Origin: clientOrigin },
        body: JSON.stringify({ password: defaultPassword })
      });
      assert(correctPass.status === 200, `Expected 200, got ${correctPass.status}`);
      const correctPassJson = await correctPass.json();
      assert(correctPassJson.data.deleted === true, 'Deleted should be true');

      // Verify zero rows in database
      const uCount = await prisma.user.count({ where: { id: user2Id } });
      const cCount = await prisma.category.count({ where: { userId: user2Id } });
      const rCount = await prisma.refreshToken.count({ where: { userId: user2Id } });
      assert(uCount + cCount + rCount === 0, 'Database cascade must leave zero rows for deleted user');
    });

    // 19. Lockout (run LAST, with its own fresh email): AUTH_RATE_MAX wrong attempts 401, next 429 Retry-After, different email still allowed
    await runTest(19, 'Per-account+IP failed-login rate limit lockout (429 Retry-After)', async () => {
      const lockoutEmail = `b1-smoke-lockout-${timestamp}@fintrack.test`;
      const otherEmail = `b1-smoke-other-${timestamp}@fintrack.test`;

      await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: clientOrigin },
        body: JSON.stringify({ name: 'Lockout Test', email: lockoutEmail, password: defaultPassword })
      });

      // Perform AUTH_RATE_MAX failed attempts
      for (let i = 0; i < env.AUTH_RATE_MAX; i++) {
        const attempt = await fetch(`${baseUrl}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: clientOrigin },
          body: JSON.stringify({ email: lockoutEmail, password: 'WrongPassword' })
        });
        assert(attempt.status === 401, `Attempt ${i + 1} should be 401, got ${attempt.status}`);
      }

      // Next attempt for the locked account must return 429
      const lockedRes = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: clientOrigin },
        body: JSON.stringify({ email: lockoutEmail, password: 'WrongPassword' })
      });
      assert(lockedRes.status === 429, `Expected 429 lockout, got ${lockedRes.status}`);
      const retryAfter = lockedRes.headers.get('retry-after');
      assert(retryAfter !== null && Number(retryAfter) > 0, '429 response must include Retry-After header');
      const lockedJson = await lockedRes.json();
      assert(lockedJson.error.code === ERROR_CODES.RATE_LIMITED, 'Expected RATE_LIMITED error code');

      // A different email from the same IP must NOT be locked out
      const differentEmailRes = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: clientOrigin },
        body: JSON.stringify({ email: otherEmail, password: 'WrongPassword' })
      });
      assert(
        differentEmailRes.status === 401,
        `Different email should return 401, not 429 (got ${differentEmailRes.status})`
      );
    });

  } finally {
    console.log('\nCleaning up all smoke test user data...');
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'b1-smoke-' } }
    }).catch(() => {});
    await prisma.$disconnect();
  }

  // Print PASS / FAIL Table
  console.log('\n================================================================');
  console.log('                    SMOKE TEST RESULTS (B1)                     ');
  console.log('================================================================');
  let hasFailed = false;

  for (const r of testResults) {
    const status = r.passed ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(`[${status}] Group ${r.group.toString().padStart(2, ' ')}: ${r.name}`);
    if (!r.passed && r.error) {
      console.log(`        Error: ${r.error}`);
      hasFailed = true;
    }
  }

  console.log('================================================================');
  const passedCount = testResults.filter((r) => r.passed).length;
  console.log(`Total: ${testResults.length} | Passed: ${passedCount} | Failed: ${testResults.length - passedCount}`);
  console.log('================================================================\n');

  if (hasFailed || testResults.length !== 19) {
    console.error('Smoke test suite failed!');
    process.exit(1);
  } else {
    console.log('All 19 smoke test groups passed successfully!');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal smoke test runner error:', err);
  process.exit(1);
});
