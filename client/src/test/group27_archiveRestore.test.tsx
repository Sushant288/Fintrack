import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from './render';
import { CategoryList } from '@/components/categories/CategoryList';
import { server } from './server';
import { http, HttpResponse } from 'msw';
import { buildEnvelope, buildCategory } from './factories';

describe('Group 27: CATEGORY ARCHIVE & RESTORE', () => {
  it('toggles archive status via PATCH and displays matching toast message', async () => {
    const activeCat = buildCategory({ id: 'c1', name: 'Transport', isArchived: false });
    let patchedBody: { isArchived?: boolean } | null = null;

    server.use(
      http.get('http://localhost:4000/api/v1/categories', () => {
        return HttpResponse.json(buildEnvelope([activeCat], { count: 1 }));
      }),
      http.patch('http://localhost:4000/api/v1/categories/c1', async ({ request }) => {
        // MSW request.json returns DefaultBodyType; cast safely for test verification
        patchedBody = (await request.json()) as { isArchived?: boolean };
        return HttpResponse.json(buildEnvelope({ ...activeCat, isArchived: patchedBody?.isArchived }));
      })
    );

    renderWithProviders(<CategoryList />);

    await waitFor(() => {
      expect(screen.getByText('Transport')).toBeInTheDocument();
    });

    // Click archive button
    const archiveBtn = screen.getByRole('button', { name: /archive category transport/i });
    await userEvent.click(archiveBtn);

    await waitFor(() => {
      expect(patchedBody).toEqual({ isArchived: true });
      expect(screen.getByText('Category archived')).toBeInTheDocument();
    });
  });
});
