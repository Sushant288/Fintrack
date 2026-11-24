import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { clsx } from 'clsx';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  className
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };

    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="modal-title"
      aria-describedby={description ? 'modal-desc' : undefined}
      className={clsx(
        'backdrop:bg-ink/50 backdrop:backdrop-blur-sm bg-panel text-ink rounded-lg p-0 shadow-2xl border border-hairline',
        'max-w-lg w-[calc(100%-2rem)] m-auto',
        'focus:outline-none focus-visible:outline-2 focus-visible:outline-marigold',
        className
      )}
    >
      <div className="p-6">
        <div className="flex items-center justify-between pb-3 border-b border-hairline mb-4">
          <div>
            <h2 id="modal-title" className="text-lg font-semibold font-heading text-ink">
              {title}
            </h2>
            {description && (
              <p id="modal-desc" className="text-xs text-muted mt-0.5">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1 rounded-sm text-muted hover:text-ink transition-colors focus-visible:outline-2 focus-visible:outline-marigold"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div>{children}</div>
      </div>
    </dialog>
  );
};
