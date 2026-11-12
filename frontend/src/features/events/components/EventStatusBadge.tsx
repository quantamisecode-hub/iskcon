import type { EventStatus } from '../types';

/**
 * Event status — one consistent colour language everywhere the app shows it:
 *   DRAFT     → slate (grey, not started)
 *   PLANNING  → amber (in progress / needs attention)
 *   READY     → sky   (set to go)
 *   COMPLETED → green (done)
 *   CANCELLED → rose  (dead)
 */

export const EVENT_STATUS_CHIP: Record<EventStatus, string> = {
  DRAFT: 'border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200',
  PLANNING: 'border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200',
  READY: 'border-sky-300 bg-sky-100 text-sky-900 hover:bg-sky-200',
  COMPLETED: 'border-emerald-300 bg-emerald-100 text-emerald-900 hover:bg-emerald-200',
  CANCELLED: 'border-rose-300 bg-rose-100 text-rose-900 hover:bg-rose-200',
};

export const EVENT_STATUS_BAR: Record<EventStatus, string> = {
  DRAFT: 'bg-slate-400',
  PLANNING: 'bg-amber-500',
  READY: 'bg-sky-500',
  COMPLETED: 'bg-emerald-600',
  CANCELLED: 'bg-rose-600',
};

const BADGE: Record<EventStatus, { label: string; className: string; dot: string }> = {
  DRAFT: { label: 'Draft', className: 'border-slate-300 bg-slate-100 text-slate-800', dot: 'bg-slate-500' },
  PLANNING: { label: 'Planning', className: 'border-amber-300 bg-amber-100 text-amber-900', dot: 'bg-amber-500' },
  READY: { label: 'Ready', className: 'border-sky-300 bg-sky-100 text-sky-900', dot: 'bg-sky-500' },
  COMPLETED: { label: 'Completed', className: 'border-emerald-300 bg-emerald-100 text-emerald-900', dot: 'bg-emerald-600' },
  CANCELLED: { label: 'Cancelled', className: 'border-rose-300 bg-rose-100 text-rose-900', dot: 'bg-rose-600' },
};

export function EventStatusBadge({ status }: { status: EventStatus }) {
  const meta = BADGE[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${meta.className}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}
