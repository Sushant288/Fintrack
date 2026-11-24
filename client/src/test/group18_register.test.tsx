import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from './render';
import { Register } from '@/pages/Register';
import { server } from './server';
import { http, HttpResponse } from 'msw';
import { buildEnvelope, buildUser } from './factories';
import { ERROR_CODES } from '@/api/errorCodes';

describe('Group 18: REGISTER PAGE', () => {
  it('updates password strength checklist live as user types', async () => {
    renderWithProviders(<Register />);

    const passwordInput = screen.getByLabelText(/^password/i);
    await userEvent.type(passwordInput, 'Abc1');

    expect(screen.getByText(/at least one letter/i)).toBeInTheDocument();
    expect(screen.getByText(/at least one number/i)).toBeInTheDocument();
  });

  it('blocks mismatched password confirmation client-side', async () => {
    renderWithProviders(<Register />);

    await userEvent.type(screen.getByLabelText(/full name/i), 'Test User');
    await userEvent.type(screen.getByLabelText(/email address/i), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/^password/i), 'ValidPass1');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'DifferentPass2');

    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });
  });

  it('maps EMAIL_TAKEN to the email field error', async () => {
    server.use(
      http.post('http://localhost:4000/api/v1/auth/register', () => {
        return HttpResponse.json(
          buildEnvelope(null, null, {
            code: ERROR_CODES.EMAIL_TAKEN,
            message: 'An account with this email address already exists'
          }),
          { status: 409 }
        );
      })
    );

    renderWithProviders(<Register />);

    await userEvent.type(screen.getByLabelText(/full name/i), 'Test User');
    await userEvent.type(screen.getByLabelText(/email address/i), 'taken@example.com');
    await userEvent.type(screen.getByLabelText(/^password/i), 'ValidPass1');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'ValidPass1');

    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText(/an account with this email address already exists/i)).toBeInTheDocument();
    });
  });

  it('sends strictly documented fields and omits currency/timezone unless opted in', async () => {
    let capturedBody: Record<string, unknown> | null = null;

    server.use(
      http.post('http://localhost:4000/api/v1/auth/register', async ({ request }) => {
        // MSW request.json returns DefaultBodyType; cast safely for test verification
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          buildEnvelope(
            {
              user: buildUser(),
              accessToken: 'token-reg',
              expiresIn: 900
            },
            null,
            null
          ),
          { status: 201 }
        );
      })
    );

    renderWithProviders(<Register />);

    await userEvent.type(screen.getByLabelText(/full name/i), 'John Doe');
    await userEvent.type(screen.getByLabelText(/email address/i), 'john@example.com');
    await userEvent.type(screen.getByLabelText(/^password/i), 'ValidPass1');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'ValidPass1');

    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(capturedBody).toEqual({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'ValidPass1'
      });
      // Currency and timezone omitted when disclosure untouched
      expect(capturedBody?.currency).toBeUndefined();
      expect(capturedBody?.timezone).toBeUndefined();
    });
  });
});
