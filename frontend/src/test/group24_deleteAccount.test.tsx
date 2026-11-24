import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from './render';
import { DeleteAccountSection } from '@/components/settings/DeleteAccountSection';
import { server } from './server';
import { http, HttpResponse } from 'msw';
import { buildEnvelope } from './factories';
import { ERROR_CODES } from '@/api/errorCodes';

describe('Group 24: DELETE ACCOUNT', () => {
  it('opens password confirmation dialog with consequence description', async () => {
    renderWithProviders(<DeleteAccountSection />);

    const openBtn = screen.getByRole('button', { name: /delete account/i });
    await userEvent.click(openBtn);

    expect(screen.getByText(/permanently deletes your account/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm your password/i)).toBeInTheDocument();
  });

  it('surfaces error when incorrect password is provided', async () => {
    server.use(
      http.delete('http://localhost:4000/api/v1/users/me', () => {
        return HttpResponse.json(
          buildEnvelope(null, null, {
            code: ERROR_CODES.INVALID_CREDENTIALS,
            message: 'Incorrect password'
          }),
          { status: 401 }
        );
      })
    );

    renderWithProviders(<DeleteAccountSection />);

    await userEvent.click(screen.getByRole('button', { name: /delete account/i }));
    await userEvent.type(screen.getByLabelText(/confirm your password/i), 'WrongPass');
    await userEvent.click(screen.getByRole('button', { name: /permanently delete account/i }));

    await waitFor(() => {
      expect(screen.getByText(/incorrect password/i)).toBeInTheDocument();
    });
  });
});
