import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

const TONES = {
  primary: 'bg-primary-soft text-primary-deep',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
  sky: 'bg-sky-50 text-sky-700',
} as const;

export type StatTone = keyof typeof TONES;

/**
 * KPI stat card: icon chip, title, value, sub-line, optional link.
 * Clean, flat, tonal - no heavy decoration.
 */
export function StatCard({
  icon,
  title,
  value,
  sub,
  tone = 'primary',
  to,
}: {
  icon: ReactNode;
  title: string;
  value: string | number;
  sub?: ReactNode;
  tone?: StatTone;
  to?: string;
}) {
  const body = (
    <div className="group flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:border-primary/40 hover:shadow-md">
      <div className="flex items-center justify-between gap-3">
        <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${TONES[tone]}`}>
          {icon}
        </span>
      </div>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-secondary">{title}</p>
      <p className="mt-1 text-3xl font-bold tracking-tight text-ink tabular-nums">{value}</p>
      {sub && <div className="mt-1.5 text-xs font-medium text-secondary">{sub}</div>}
    </div>
  );

  return to ? (
    <Link to={to} className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-2xl">
      {body}
    </Link>
  ) : (
    body
  );
}
