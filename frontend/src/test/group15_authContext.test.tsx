import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import React from 'react';
import { renderWithProviders } from './render';
import { useAuth } from '@/hooks/useAuth';
import { server } from './server';
import { http, HttpResponse } from 'msw';
import { buildEnvelope, buildUser } from './factories';
import { ERROR_CODES } from '@/api/errorCodes';

const AuthTestConsumer: React.FC = () => {
  const { status, user, bannerError, logout } = useAuth();
  return (
    <div>
      <span data-testid="auth-status">{status}</span>
      <span data-testid="user-name">{user?.name || 'none'}</span>
      {bannerError && <span data-testid="banner-error">{bannerError}</span>}
      <button onClick={() => logout()}>Logout</button>
    </div>
  );
};

describe('Group 15: AUTH CONTEXT', () => {
  it('bootstraps into authenticated state on valid refresh cookie', async () => {
    server.use(
      http.post('http://localhost:4000/api/v1/auth/refresh', () => {
        return HttpResponse.json(
          buildEnvelope({
            user: buildUser({ name: 'Alice Smith' }),
            accessToken: 'token-alice',
            expiresIn: 900
          })
        );
      })
    );

    renderWithProviders(<AuthTestConsumer />);

    await waitFor(() => {
      expect(screen.getByTestId('auth-status').textContent).toBe('authenticated');
      expect(screen.getByTestId('user-name').textContent).toBe('Alice Smith');
    });
  });

  it('quietly sets unauthenticated on REFRESH_TOKEN_MISSING with no banner error', async () => {
    server.use(
      http.post('http://localhost:4000/api/v1/auth/refresh', () => {
        return HttpResponse.json(
          buildEnvelope(null, null, {
            code: ERROR_CODES.REFRESH_TOKEN_MISSING,
            message: 'No refresh token'
          }),
          { status: 401 }
        );
      })
    );

    renderWithProviders(<AuthTestConsumer />);

    await waitFor(() => {
      expect(screen.getByTestId('auth-status').textContent).toBe('unauthenticated');
      expect(screen.queryByTestId('banner-error')).not.toBeInTheDocument();
    });
  });

  it('displays non-blocking error banner when server is down', async () => {
    server.use(
      http.post('http://localhost:4000/api/v1/auth/refresh', () => {
        return HttpResponse.error();
      })
    );

    renderWithProviders(<AuthTestConsumer />);

    await waitFor(() => {
      expect(screen.getByTestId('auth-status').textContent).toBe('unauthenticated');
      expect(screen.getByTestId('banner-error')).toBeInTheDocument();
    });
  });
});
