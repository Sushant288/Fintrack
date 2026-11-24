import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from './render';
import { App } from '@/App';
import { server } from './server';
import { http, HttpResponse } from 'msw';
import { buildEnvelope, buildUser } from './factories';
import { ENABLED_NAV_ITEMS, NAV_ITEMS } from '@/config/nav';

describe('Group 16: ROUTING & NAVIGATION', () => {
  it('redirects unauthenticated users to /login preserving return state', async () => {
    server.use(
      http.post('http://localhost:4000/api/v1/auth/refresh', () => {
        return HttpResponse.json(buildEnvelope(null, null, { code: 'REFRESH_TOKEN_MISSING', message: 'No cookie' }), { status: 401 });
      })
    );

    renderWithProviders(<App />, { initialEntries: ['/categories'] });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
    });
  });

  it('renders sidebar displaying strictly enabled navigation items in F1', async () => {
    server.use(
      http.post('http://localhost:4000/api/v1/auth/refresh', () => {
        return HttpResponse.json(
          buildEnvelope({
            user: buildUser(),
            accessToken: 'token-abc',
            expiresIn: 900
          })
        );
      })
    );

    renderWithProviders(<App />, { initialEntries: ['/'] });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /hello/i })).toBeInTheDocument();
    });

    // Enabled items must be rendered
    for (const item of ENABLED_NAV_ITEMS) {
      expect(screen.getAllByText(item.label).length).toBeGreaterThan(0);
    }

    // Disabled items (F2-F4) must NOT be in the navigation
    const disabledItems = NAV_ITEMS.filter((i) => !i.enabled);
    for (const item of disabledItems) {
      expect(screen.queryByRole('link', { name: new RegExp(item.label, 'i') })).not.toBeInTheDocument();
    }
  });

  it('renders NotFound component for unknown routes when authenticated', async () => {
    server.use(
      http.post('http://localhost:4000/api/v1/auth/refresh', () => {
        return HttpResponse.json(
          buildEnvelope({
            user: buildUser(),
            accessToken: 'token-abc',
            expiresIn: 900
          })
        );
      })
    );

    renderWithProviders(<App />, { initialEntries: ['/some-random-route'] });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument();
    });
  });
});
