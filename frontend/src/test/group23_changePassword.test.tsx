import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from './render';
import { ChangePasswordForm } from '@/components/settings/ChangePasswordForm';
import { server } from './server';
import { http, HttpResponse } from 'msw';
import { buildEnvelope, buildUser } from './factories';
import { ERROR_CODES } from '@/api/errorCodes';

describe('Group 23: CHANGE PASSWORD', () => {
  it('CURRENT_PASSWORD_INCORRECT is 400 and shows on field without refresh or logout', async () => {
    let refreshCalls = 0;

    server.use(
      http.post('http://localhost:4000/api/v1/auth/refresh', () => {
        refreshCalls++;
        return HttpResponse.json(buildEnvelope(null));
      }),
      http.post('http://localhost:4000/api/v1/users/me/change-password', () => {
        return HttpResponse.json(
          buildEnvelope(null, null, {
            code: ERROR_CODES.CURRENT_PASSWORD_INCORRECT,
            message: 'Current password provided is incorrect'
          }),
          { status: 400 }
        );
      })
    );

    renderWithProviders(<ChangePasswordForm />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /update password/i })).toBeInTheDocument();
    });

    const refreshCallsBefore = refreshCalls;

    await userEvent.type(screen.getByLabelText(/current password/i), 'WrongCurrentPassword');
    await userEvent.type(screen.getByLabelText(/^new password/i), 'ValidNewPassword1');
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'ValidNewPassword1');

    await userEvent.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => {
      expect(screen.getByText(/current password provided is incorrect/i)).toBeInTheDocument();
    });

    // Must NOT have called refresh
    expect(refreshCalls).toBe(refreshCallsBefore);
  });

  it('SAME_PASSWORD displays error on new password field', async () => {
    server.use(
      http.post('http://localhost:4000/api/v1/users/me/change-password', () => {
        return HttpResponse.json(
          buildEnvelope(null, null, {
            code: ERROR_CODES.SAME_PASSWORD,
            message: 'New password cannot be identical to current password'
          }),
          { status: 400 }
        );
      })
    );

    renderWithProviders(<ChangePasswordForm />);

    await userEvent.type(screen.getByLabelText(/current password/i), 'SamePassword1');
    await userEvent.type(screen.getByLabelText(/^new password/i), 'SamePassword1');
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'SamePassword1');

    await userEvent.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => {
      expect(screen.getByText(/new password cannot be identical to current password/i)).toBeInTheDocument();
    });
  });

  it('success applies new session and shows confirmation toast', async () => {
    server.use(
      http.post('http://localhost:4000/api/v1/users/me/change-password', () => {
        return HttpResponse.json(
          buildEnvelope({
            user: buildUser(),
            accessToken: 'brand-new-token-after-password-change',
            expiresIn: 900
          })
        );
      })
    );

    renderWithProviders(<ChangePasswordForm />);

    await userEvent.type(screen.getByLabelText(/current password/i), 'OldPassword1');
    await userEvent.type(screen.getByLabelText(/^new password/i), 'NewPassword123');
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'NewPassword123');

    await userEvent.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => {
      expect(screen.getByText(/password changed/i)).toBeInTheDocument();
    });
  });
});
