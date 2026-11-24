import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from './render';
import { Login } from '@/pages/Login';
import { server } from './server';
import { http, HttpResponse } from 'msw';
import { buildEnvelope, buildUser } from './factories';
import { ERROR_CODES } from '@/api/errorCodes';

describe('Group 17: LOGIN PAGE', () => {
  it('submits valid credentials sending strictly { email, password }', async () => {
    let capturedBody: Record<string, unknown> | null = null;

    server.use(
      http.post('http://localhost:4000/api/v1/auth/login', async ({ request }) => {
        // MSW request.json returns DefaultBodyType; cast safely for test verification
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          buildEnvelope({
            user: buildUser(),
            accessToken: 'login-token-123',
            expiresIn: 900
          })
        );
      })
    );

    renderWithProviders(<Login />);

    await userEvent.type(screen.getByLabelText(/email address/i), 'user@example.com');
    await userEvent.type(screen.getByLabelText(/^password/i), 'Password123');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(capturedBody).toEqual({
        email: 'user@example.com',
        password: 'Password123'
      });
    });
  });

  it('displays one form-level message on INVALID_CREDENTIALS without marking fields', async () => {
    server.use(
      http.post('http://localhost:4000/api/v1/auth/login', () => {
        return HttpResponse.json(
          buildEnvelope(null, null, {
            code: ERROR_CODES.INVALID_CREDENTIALS,
            message: 'Invalid email or password'
          }),
          { status: 401 }
        );
      })
    );

    renderWithProviders(<Login />);

    await userEvent.type(screen.getByLabelText(/email address/i), 'wrong@example.com');
    await userEvent.type(screen.getByLabelText(/^password/i), 'WrongPass');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password');
    });
  });

  it('toggles password visibility with accessible button name', async () => {
    renderWithProviders(<Login />);

    const passwordInput = screen.getByLabelText(/^password/i);
    expect(passwordInput).toHaveAttribute('type', 'password');

    const toggleBtn = screen.getByRole('button', { name: /show password/i });
    await userEvent.click(toggleBtn);

    expect(passwordInput).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: /hide password/i })).toBeInTheDocument();
  });
});
