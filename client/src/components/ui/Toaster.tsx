import React, { useState } from 'react';
import { useToast, ToastItem } from '@/context/ToastContext';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { clsx } from 'clsx';

export const Toaster: React.FC = () => {
  const { toasts, dismiss } = useToast();
  const [isPaused, setIsPaused] = useState(false);

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
    >
      {toasts.map((toast: ToastItem) => {
        const icons = {
          success: <CheckCircle2 className="w-5 h-5 text-income flex-shrink-0" />,
          error: <AlertCircle className="w-5 h-5 text-danger flex-shrink-0" />,
          info: <Info className="w-5 h-5 text-primary flex-shrink-0" />
        };

        return (
          <div
            key={toast.id}
            role="status"
            className={clsx(
              'pointer-events-auto flex items-start gap-3 p-4 rounded-md shadow-lg border bg-panel text-ink transition-all duration-200',
              toast.type === 'error' ? 'border-danger/40' : 'border-hairline',
              isPaused && 'opacity-95'
            )}
          >
            {icons[toast.type]}
            <div className="flex-1 text-sm">
              <p className="font-medium leading-snug">{toast.message}</p>
              {toast.requestId && (
                <p className="text-xs text-muted mt-1 font-mono">
                  Request ID: {toast.requestId}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss toast"
              className="text-muted hover:text-ink p-1 rounded-sm focus-visible:outline-2 focus-visible:outline-marigold"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
