import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmActionModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  isBusy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmActionModal: React.FC<ConfirmActionModalProps> = ({
  isOpen,
  title,
  description,
  confirmLabel,
  destructive = false,
  isBusy = false,
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isBusy) onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isBusy, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
      onClick={() => {
        if (!isBusy) onCancel();
      }}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-action-title"
      aria-describedby="confirm-action-description"
    >
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto sm:hidden" />

        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                destructive
                  ? 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-400'
                  : 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400'
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="confirm-action-title"
                className="text-base font-semibold text-slate-900 dark:text-slate-100"
              >
                {title}
              </h2>
              <p
                id="confirm-action-description"
                className="mt-1 text-sm text-slate-600 dark:text-slate-300 leading-relaxed"
              >
                {description}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={onCancel}
            aria-label="Cancel"
            className="min-h-[40px] min-w-[40px] -mt-1 -mr-1 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="pt-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pb-safe">
          <button
            type="button"
            disabled={isBusy}
            onClick={onCancel}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={onConfirm}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-60 ${
              destructive
                ? 'bg-red-700 hover:bg-red-800'
                : 'bg-blue-700 hover:bg-blue-800'
            }`}
          >
            {isBusy ? 'Processing…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
