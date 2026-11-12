import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * Widget shell used across the dashboard: title row, optional action,
 * children. Keeps spacing/typography consistent between widgets.
 */
export function DashboardWidget({
  title,
  action,
  actionTo,
  children,
  className = '',
}: {
  title: string;
  action?: string;
  actionTo?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex flex-col rounded-2xl border border-border bg-card shadow-sm ${className}`}>
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">{title}</h2>
        {action && actionTo && (
          <Link
            to={actionTo}
            className="text-xs font-semibold text-primary underline-offset-2 transition hover:text-primary-dark hover:underline"
          >
            {action} →
          </Link>
        )}
      </header>
      <div className="flex-1 p-5">{children}</div>
    </section>
  );
}

/** Friendly per-widget empty state. Never shows fake data. */
export function WidgetEmpty({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-center">
      <p className="text-sm font-semibold text-ink">{message}</p>
      {hint && <p className="mt-1 text-xs text-secondary">{hint}</p>}
    </div>
  );
}
