import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tokenStore } from '@/api/tokenStore';

describe('Group 8: TOKEN STORE', () => {
  beforeEach(() => {
    tokenStore.clear();
  });

  it('stores access token in-memory and increments version on mutations', () => {
    const initial = tokenStore.get();
    expect(initial.accessToken).toBeNull();
    const v0 = initial.version;

    tokenStore.set('mock-access-token', 900);
    const updated = tokenStore.get();
    expect(updated.accessToken).toBe('mock-access-token');
    expect(tokenStore.getAccessToken()).toBe('mock-access-token');
    expect(updated.expiresAtMs).toBeGreaterThan(Date.now());
    expect(updated.version).toBe(v0 + 1);

    tokenStore.clear();
    const cleared = tokenStore.get();
    expect(cleared.accessToken).toBeNull();
    expect(tokenStore.getAccessToken()).toBeNull();
    expect(cleared.version).toBe(v0 + 2);
  });

  it('never accesses localStorage, sessionStorage, or document.cookie', () => {
    const localSpy = vi.spyOn(Storage.prototype, 'setItem');
    const localGetSpy = vi.spyOn(Storage.prototype, 'getItem');

    tokenStore.set('token-xyz', 300);
    tokenStore.get();
    tokenStore.clear();

    expect(localSpy).not.toHaveBeenCalled();
    expect(localGetSpy).not.toHaveBeenCalled();

    localSpy.mockRestore();
    localGetSpy.mockRestore();
  });

  it('notifies subscribers when token changes', () => {
    const listener = vi.fn();
    const unsubscribe = tokenStore.subscribe(listener);

    tokenStore.set('token-abc', 600);
    expect(listener).toHaveBeenCalledTimes(1);

    tokenStore.clear();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    tokenStore.set('token-def', 600);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
