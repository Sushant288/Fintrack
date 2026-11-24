import { env } from '../config/env';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_SEVERITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

const SENSITIVE_KEYS = new Set([
  'password',
  'newpassword',
  'currentpassword',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie'
]);

function redact(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(redact);
  }

  if (typeof obj === 'object') {
    if (obj instanceof Error) {
      return {
        name: obj.name,
        message: obj.message,
        stack: obj.stack
      };
    }

    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        clean[key] = '[REDACTED]';
      } else {
        clean[key] = redact(value);
      }
    }
    return clean;
  }

  return obj;
}

class Logger {
  private currentLevelIndex: number;

  constructor() {
    this.currentLevelIndex = LEVEL_SEVERITY[env.LOG_LEVEL];
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_SEVERITY[level] >= this.currentLevelIndex;
  }

  private write(level: LogLevel, message: string, data?: unknown, requestId?: string): void {
    if (!this.shouldLog(level)) return;

    const payload: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      message
    };

    if (requestId) {
      payload.requestId = requestId;
    }

    if (data !== undefined) {
      payload.data = redact(data);
    }

    const json = JSON.stringify(payload);
    if (level === 'error') {
      console.error(json);
    } else if (level === 'warn') {
      console.warn(json);
    } else {
      console.log(json);
    }
  }

  debug(message: string, data?: unknown, requestId?: string): void {
    this.write('debug', message, data, requestId);
  }

  info(message: string, data?: unknown, requestId?: string): void {
    this.write('info', message, data, requestId);
  }

  warn(message: string, data?: unknown, requestId?: string): void {
    this.write('warn', message, data, requestId);
  }

  error(message: string, data?: unknown, requestId?: string): void {
    this.write('error', message, data, requestId);
  }
}

export const logger = new Logger();
