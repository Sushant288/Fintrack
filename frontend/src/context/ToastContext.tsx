import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { TIMING } from '@/config/timing';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  requestId?: string | null;
}

interface ToastContextValue {
  toasts: ToastItem[];
  success: (message: string) => void;
  error: (message: string, requestId?: string | null) => void;
  info: (message: string) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const lastToastRef = useRef<{ message: string; timestamp: number } | null>(null);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type: ToastType, message: string, requestId?: string | null) => {
      const now = Date.now();
      // De-duplicate identical consecutive messages within 1 second
      if (
        lastToastRef.current &&
        lastToastRef.current.message === message &&
        now - lastToastRef.current.timestamp < 1000
      ) {
        return;
      }
      lastToastRef.current = { message, timestamp: now };

      const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
      const newToast: ToastItem = { id, type, message, requestId };

      setToasts((prev) => {
        const updated = [...prev, newToast];
        return updated.slice(-TIMING.MAX_VISIBLE_TOASTS);
      });

      // Auto-dismiss for success and info toasts (errors stay until dismissed)
      if (type !== 'error') {
        setTimeout(() => {
          dismiss(id);
        }, TIMING.TOAST_DURATION_MS);
      }
    },
    [dismiss]
  );

  const success = useCallback((msg: string) => addToast('success', msg), [addToast]);
  const error = useCallback(
    (msg: string, reqId?: string | null) => addToast('error', msg, reqId),
    [addToast]
  );
  const info = useCallback((msg: string) => addToast('info', msg), [addToast]);

  return (
    <ToastContext.Provider value={{ toasts, success, error, info, dismiss }}>
      {children}
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
