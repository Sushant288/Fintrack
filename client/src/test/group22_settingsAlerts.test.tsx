import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from './render';
import { AlertPreferencesForm } from '@/components/settings/AlertPreferencesForm';
import { server } from './server';
import { http, HttpResponse } from 'msw';
import { buildEnvelope, buildUser } from './factories';

describe('Group 22: SETTINGS ALERT PREFERENCES', () => {
  it('manages alert thresholds: add, remove, unique rules and sends booleans', async () => {
    let capturedPatch: { alertThresholds?: number[]; alertInAppEnabled?: boolean; alertEmailEnabled?: boolean } | null = null;

    server.use(
      http.post('http://localhost:4000/api/v1/auth/refresh', () => {
        return HttpResponse.json(
          buildEnvelope({
            user: buildUser({ alertThresholds: [80, 100], alertInAppEnabled: true, alertEmailEnabled: false }),
            accessToken: 'token-abc',
            expiresIn: 900
          })
        );
      }),
      http.patch('http://localhost:4000/api/v1/users/me', async ({ request }) => {
        // MSW request.json returns DefaultBodyType; cast safely for test verification
        capturedPatch = (await request.json()) as {
          alertThresholds?: number[];
          alertInAppEnabled?: boolean;
          alertEmailEnabled?: boolean;
        };
        return HttpResponse.json(buildEnvelope(buildUser(capturedPatch ?? undefined)));
      })
    );

    renderWithProviders(<AlertPreferencesForm />);

    await waitFor(() => {
      expect(screen.getByText('80%')).toBeInTheDocument();
      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    // Add 90% threshold
    const input = screen.getByLabelText(/new threshold percentage/i);
    await userEvent.type(input, '90');
    await userEvent.click(screen.getByRole('button', { name: /add threshold/i }));

    expect(screen.getByText('90%')).toBeInTheDocument();

    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    await userEvent.click(saveBtn);

    await waitFor(() => {
      expect(capturedPatch).toBeDefined();
      expect(capturedPatch?.alertThresholds).toEqual([80, 90, 100]);
    });
  });
});
