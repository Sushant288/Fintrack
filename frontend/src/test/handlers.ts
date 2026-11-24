import { http, HttpResponse } from 'msw';
import { buildUser, buildCategory, buildEnvelope } from './factories';

const BASE_URL = 'http://localhost:4000/api/v1';

export const handlers = [
  // Refresh endpoint
  http.post(`${BASE_URL}/auth/refresh`, () => {
    return HttpResponse.json(
      buildEnvelope({
        user: buildUser(),
        accessToken: 'mock-access-token-123',
        expiresIn: 900
      })
    );
  }),

  // Login endpoint
  http.post(`${BASE_URL}/auth/login`, () => {
    return HttpResponse.json(
      buildEnvelope({
        user: buildUser(),
        accessToken: 'mock-access-token-123',
        expiresIn: 900
      })
    );
  }),

  // Register endpoint
  http.post(`${BASE_URL}/auth/register`, () => {
    return HttpResponse.json(
      buildEnvelope(
        {
          user: buildUser(),
          accessToken: 'mock-access-token-123',
          expiresIn: 900
        },
        null,
        null
      ),
      { status: 201 }
    );
  }),

  // Logout endpoint
  http.post(`${BASE_URL}/auth/logout`, () => {
    return HttpResponse.json(buildEnvelope(null));
  }),

  // Get Me endpoint
  http.get(`${BASE_URL}/users/me`, () => {
    return HttpResponse.json(buildEnvelope(buildUser()));
  }),

  // Patch Me endpoint
  http.patch(`${BASE_URL}/users/me`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(buildEnvelope(buildUser(body)));
  }),

  // Categories list
  http.get(`${BASE_URL}/categories`, () => {
    const list = [
      buildCategory({ id: 'c1', name: 'Food', type: 'EXPENSE', color: '#ef4444', icon: 'utensils' }),
      buildCategory({ id: 'c2', name: 'Salary', type: 'INCOME', color: '#22c55e', icon: 'briefcase' })
    ];
    return HttpResponse.json(buildEnvelope(list, { count: list.length }));
  })
];
