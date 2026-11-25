import { useEffect, useMemo, useRef, useState } from 'react';
import { displayDateToIso, isoDateToDisplay } from '../../utils/dateTime';
import { CalendarIcon } from './icons';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * Calendar picker that keeps the user-facing format DD/MM/YYYY while the
 * caller receives exactly that string. Native <input type="date"> shows a
 * locale-dependent order (often YYYY/MM/DD), so the calendar is rendered here.
 */
export function DatePicker({
  id,
  value,
  onChange,
  required = false,
  placeholder = 'DD/MM/YYYY',
  className = '',
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedIso = displayDateToIso(value);
  const initial = selectedIso
    ? new Date(`${selectedIso}T00:00:00Z`)
    : new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  const [viewYear, setViewYear] = useState(initial.getUTCFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getUTCMonth());

  // Re-open on the selected date when the value changes from outside.
  useEffect(() => {
    const iso = displayDateToIso(value);
    if (!iso) return;
    const date = new Date(`${iso}T00:00:00Z`);
    setViewYear(date.getUTCFullYear());
    setViewMonth(date.getUTCMonth());
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const days = useMemo(() => {
    const firstWeekday = (new Date(Date.UTC(viewYear, viewMonth, 1)).getUTCDay() + 6) % 7; // Monday first
    const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();
    return [
      ...Array.from({ length: firstWeekday }, () => null),
      ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
    ];
  }, [viewYear, viewMonth]);

  const monthLabel = new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(viewYear, viewMonth, 1)));

  const choose = (day: number) => {
    onChange(`${pad(day)}/${pad(viewMonth + 1)}/${viewYear}`);
    setOpen(false);
  };

  const shiftMonth = (delta: number) => {
    const next = new Date(Date.UTC(viewYear, viewMonth + delta, 1));
    setViewYear(next.getUTCFullYear());
    setViewMonth(next.getUTCMonth());
  };

  const todayIso = isoDateToDisplay(new Date().toISOString().slice(0, 10));

  return (
    <div ref={containerRef} className="relative" onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}>
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          required={required}
          maxLength={10}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label="Date in DD/MM/YYYY format"
          className={`w-full rounded-xl border border-border-strong/70 bg-white py-2.5 pl-3.5 pr-10 text-sm text-ink outline-none transition placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/25 ${className}`}
        />
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-label="Open calendar"
          aria-expanded={open}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-secondary transition hover:bg-primary-soft hover:text-primary"
        >
          <CalendarIcon className="h-4 w-4" />
        </button>
      </div>

      {open && (
        <div className="absolute left-0 z-30 mt-1 w-72 rounded-xl border border-border bg-card p-3 shadow-xl" role="dialog" aria-label="Choose date">
          <div className="mb-2 flex items-center justify-between gap-2">
            <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month" className="rounded-lg border border-border px-2 py-1 text-sm text-ink hover:bg-background">‹</button>
            <span className="text-xs font-bold uppercase tracking-wider text-ink">{monthLabel}</span>
            <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month" className="rounded-lg border border-border px-2 py-1 text-sm text-ink hover:bg-background">›</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-muted">
            {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {days.map((day, index) => {
              if (day === null) return <span key={`blank-${index}`} />;
              const display = `${pad(day)}/${pad(viewMonth + 1)}/${viewYear}`;
              const isSelected = display === value;
              const isToday = display === todayIso;
              return (
                <button
                  key={display}
                  type="button"
                  onClick={() => choose(day)}
                  aria-label={`Select ${display}`}
                  className={`rounded-lg py-1.5 text-xs font-semibold transition ${
                    isSelected
                      ? 'bg-primary text-primary-foreground'
                      : isToday
                        ? 'bg-primary-soft text-primary-deep'
                        : 'text-ink hover:bg-background'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
            <button type="button" onClick={() => setOpen(false)} className="text-[11px] font-semibold text-secondary hover:text-ink">Close</button>
            <button
              type="button"
              onClick={() => { onChange(todayIso); setOpen(false); }}
              className="text-[11px] font-semibold text-primary hover:underline"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
