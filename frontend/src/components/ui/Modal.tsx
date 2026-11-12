import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Generic Modal (dialog).
 *  - role="dialog", aria-modal, labelled by aria-labelledby
 *  - Escape closes, backdrop click closes (optional)
 *  - Initial focus moves to the first focusable element; focus returns on close
 *  - Respects prefers-reduced-motion via CSS animation class
 */
export function Modal({
  title,
  onClose,
  children,
  maxWidthClass = 'max-w-lg',
  closeOnBackdrop = true,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidthClass?: string;
  closeOnBackdrop?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = dialog.querySelector<HTMLElement>(
      'input, select, textarea, button, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();
    return () => previousFocusRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
      onClick={() => closeOnBackdrop && onClose()}
    >
      <div
        className={`absolute inset-0 bg-black/45 backdrop-blur-[2px] ${closeOnBackdrop ? 'cursor-pointer' : ''}`}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`animate-modal-in relative w-full ${maxWidthClass} max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-card`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="modal-title" className="text-lg font-bold tracking-tight text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-secondary transition hover:bg-background hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5" aria-hidden="true">
              <path d="M6 6l12 12" />
              <path d="M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
