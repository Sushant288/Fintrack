import { BROADCAST_CHANNELS, WEB_LOCKS } from '@/config/storageKeys';
import { TIMING } from '@/config/timing';
import { tokenStore } from './tokenStore';
import { SafeUser } from '@/types';

export interface SessionPayload {
  type: 'session';
  user: SafeUser;
  accessToken: string;
  expiresIn: number;
}

export interface LogoutPayload {
  type: 'logout';
}

export type BroadcastMessage = (SessionPayload | LogoutPayload) & { senderId: string };

const tabId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
let broadcastChannel: BroadcastChannel | null = null;
let proactiveTimer: ReturnType<typeof setTimeout> | null = null;

// Initialize BroadcastChannel
try {
  if (typeof BroadcastChannel !== 'undefined') {
    broadcastChannel = new BroadcastChannel(BROADCAST_CHANNELS.SESSION);
  }
} catch {
  broadcastChannel = null;
}

export function broadcastSession(user: SafeUser, accessToken: string, expiresIn: number): void {
  if (!broadcastChannel) return;
  try {
    broadcastChannel.postMessage({
      type: 'session',
      user,
      accessToken,
      expiresIn,
      senderId: tabId
    });
  } catch {
    /* ignore broadcast errors */
  }
}

export function broadcastLogout(): void {
  if (!broadcastChannel) return;
  try {
    broadcastChannel.postMessage({
      type: 'logout',
      senderId: tabId
    });
  } catch {
    /* ignore broadcast errors */
  }
}

export function setupMultiTabSync(handlers: {
  onSession: (user: SafeUser, accessToken: string, expiresIn: number) => void;
  onLogout: () => void;
}): () => void {
  if (!broadcastChannel) return () => {};

  const handleMessage = (event: MessageEvent<BroadcastMessage>) => {
    const msg = event.data;
    if (!msg || msg.senderId === tabId) return;

    if (msg.type === 'session') {
      tokenStore.set(msg.accessToken, msg.expiresIn);
      handlers.onSession(msg.user, msg.accessToken, msg.expiresIn);
    } else if (msg.type === 'logout') {
      tokenStore.clear();
      handlers.onLogout();
    }
  };

  broadcastChannel.addEventListener('message', handleMessage);
  return () => {
    broadcastChannel?.removeEventListener('message', handleMessage);
  };
}

export function scheduleProactiveRefresh(
  expiresInSeconds: number,
  onRefresh: () => Promise<unknown>
): void {
  clearProactiveRefresh();

  const delayMs = Math.max(0, expiresInSeconds * 1000 - TIMING.REFRESH_SKEW_MS);
  proactiveTimer = setTimeout(async () => {
    try {
      await onRefresh();
    } catch {
      /* ignore proactive refresh failure */
    }
  }, delayMs);
}

export function clearProactiveRefresh(): void {
  if (proactiveTimer) {
    clearTimeout(proactiveTimer);
    proactiveTimer = null;
  }
}

export async function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  // Use Web Locks when available
  if (typeof navigator !== 'undefined' && 'locks' in navigator && navigator.locks?.request) {
    return navigator.locks.request(WEB_LOCKS.REFRESH, async () => {
      return fn();
    });
  }
  return fn();
}
