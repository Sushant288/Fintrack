/**
 * In-memory token store.
 * The access token lives ONLY in memory.
 * Never stored in localStorage, sessionStorage, cookies or the URL.
 */

type Listener = () => void;

interface TokenState {
  accessToken: string | null;
  expiresAtMs: number;
  version: number;
}

let state: TokenState = {
  accessToken: null,
  expiresAtMs: 0,
  version: 0
};

const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* ignore subscriber error */
    }
  });
}

export const tokenStore = {
  get(): Readonly<TokenState> {
    return state;
  },

  getAccessToken(): string | null {
    return state.accessToken;
  },

  set(token: string, expiresInSeconds: number): void {
    state = {
      accessToken: token,
      expiresAtMs: Date.now() + expiresInSeconds * 1000,
      version: state.version + 1
    };
    notify();
  },

  clear(): void {
    state = {
      accessToken: null,
      expiresAtMs: 0,
      version: state.version + 1
    };
    notify();
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
};
