import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scheduleProactiveRefresh, clearProactiveRefresh } from '@/api/sessionSync';
import { TIMING } from '@/config/timing';

describe('Group 14: PROACTIVE REFRESH', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearProactiveRefresh();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('schedules proactive refresh before token expiry (expiresIn - skew)', () => {
    const onRefresh = vi.fn(async () => {});
    const expiresInSeconds = 900; // 15 mins (900,000 ms)

    scheduleProactiveRefresh(expiresInSeconds, onRefresh);

    const expectedDelay = 900 * 1000 - TIMING.REFRESH_SKEW_MS;

    // Advance time just before expected trigger
    vi.advanceTimersByTime(expectedDelay - 1000);
    expect(onRefresh).not.toHaveBeenCalled();

    // Advance to trigger time
    vi.advanceTimersByTime(1000);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('cancels scheduled timer on clearProactiveRefresh', () => {
    const onRefresh = vi.fn(async () => {});
    scheduleProactiveRefresh(900, onRefresh);

    clearProactiveRefresh();
    vi.advanceTimersByTime(900 * 1000);

    expect(onRefresh).not.toHaveBeenCalled();
  });
});
