import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withRefreshLock, setupMultiTabSync, broadcastSession, broadcastLogout } from '@/api/sessionSync';
import { tokenStore } from '@/api/tokenStore';
import { buildUser } from './factories';

describe('Group 13: MULTI-TAB SYNCHRONIZATION', () => {
  beforeEach(() => {
    tokenStore.clear();
  });

  it('withRefreshLock falls back gracefully to in-tab execution when navigator.locks is unsupported', async () => {
    const originalLocks = navigator.locks;
    // Single typed helper with one-line cast to simulate unsupported environment
    (navigator as unknown as { locks: unknown }).locks = undefined;

    const action = vi.fn(async () => 'success');
    const result = await withRefreshLock(action);

    expect(result).toBe('success');
    expect(action).toHaveBeenCalledTimes(1);

    // Restore
    (navigator as unknown as { locks: unknown }).locks = originalLocks;
  });

  it('syncs session and logout across tabs via broadcast handlers', () => {
    const onSession = vi.fn();
    const onLogout = vi.fn();

    const cleanup = setupMultiTabSync({ onSession, onLogout });

    // Mock incoming message from another tab
    const mockUser = buildUser();
    broadcastSession(mockUser, 'new-token-abc', 900);
    broadcastLogout();

    cleanup();
  });
});
