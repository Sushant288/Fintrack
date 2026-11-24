import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from './render';
import { ProfileForm } from '@/components/settings/ProfileForm';
import { PreferencesForm } from '@/components/settings/PreferencesForm';
import { server } from './server';
import { http, HttpResponse } from 'msw';
import { buildEnvelope, buildUser } from './factories';

describe('Group 21: SETTINGS PROFILE & REGION FORMS', () => {
  it('disables Save when nothing changed and sends strictly changed fields on submit', async () => {
    let capturedPatch: Record<string, unknown> | null = null;

    server.use(
      http.post('http://localhost:4000/api/v1/auth/refresh', () => {
        return HttpResponse.json(
          buildEnvelope({
            user: buildUser({ name: 'Initial Name' }),
            accessToken: 'token-abc',
            expiresIn: 900
          })
        );
      }),
      http.patch('http://localhost:4000/api/v1/users/me', async ({ request }) => {
        // MSW request.json returns DefaultBodyType; cast safely for test verification
        capturedPatch = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(buildEnvelope(buildUser({ name: 'Updated Name' })));
      })
    );

    renderWithProviders(<ProfileForm />);

    await waitFor(() => {
      expect(screen.getByLabelText(/full name/i)).toHaveValue('Initial Name');
    });

    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    expect(saveBtn).toBeDisabled();

    // Change name
    const input = screen.getByLabelText(/full name/i);
    await userEvent.clear(input);
    await userEvent.type(input, 'Updated Name');

    expect(saveBtn).toBeEnabled();
    await userEvent.click(saveBtn);

    await waitFor(() => {
      expect(capturedPatch).toEqual({ name: 'Updated Name' });
    });
  });

  it('populates currency and time zone from Intl and sends only modified values', async () => {
    let capturedPatch: Record<string, unknown> | null = null;

    server.use(
      http.post('http://localhost:4000/api/v1/auth/refresh', () => {
        return HttpResponse.json(
          buildEnvelope({
            user: buildUser({ currency: 'USD', timezone: 'UTC' }),
            accessToken: 'token-abc',
            expiresIn: 900
          })
        );
      }),
      http.patch('http://localhost:4000/api/v1/users/me', async ({ request }) => {
        // MSW request.json returns DefaultBodyType; cast safely for test verification
        capturedPatch = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(buildEnvelope(buildUser({ currency: 'EUR', timezone: 'UTC' })));
      })
    );

    renderWithProviders(<PreferencesForm />);

    await waitFor(() => {
      expect(screen.getByLabelText(/base currency/i)).toHaveValue('USD');
    });

    const currencySelect = screen.getByLabelText(/base currency/i);
    await userEvent.selectOptions(currencySelect, 'EUR');

    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    expect(saveBtn).toBeEnabled();
    await userEvent.click(saveBtn);

    await waitFor(() => {
      // Timezone was unchanged so only currency was sent
      expect(capturedPatch).toEqual({ currency: 'EUR' });
    });
  });
});
