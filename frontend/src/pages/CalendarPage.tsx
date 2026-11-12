import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchCalendarEvents } from '../features/events/api/events.api';
import { EventStatusBadge, EVENT_STATUS_CHIP, EVENT_STATUS_BAR } from '../features/events/components/EventStatusBadge';
import { Skeleton } from '../components/ui/Skeleton';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon } from '../components/ui/icons';
import type { CalendarEvent } from '../features/events/types';

type ViewMode = 'month' | 'week' | 'day';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 06:00 → 22:00
const HOUR_PX = 64;
const GRID_START_MIN = 6 * 60;
const GRID_END_MIN = 22 * 60;

interface DayCell {
  date: string; // YYYY-MM-DD
  day: number;
  inCurrentMonth: boolean;
  isToday: boolean;
}

function toDateOnlyString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysDate(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeekMonday(date: Date): Date {
  const day = date.getDay(); // 0 = Sunday
  const offset = (day + 6) % 7; // Monday-first
  return addDaysDate(date, -offset);
}

function parseTimeMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatHour(hour: number): string {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${suffix}`;
}

function formatDayMonth(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return `${day} ${MONTH_SHORT[(month ?? 1) - 1]} ${year}`;
}

function formatDayLong(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(year ?? 2026, (month ?? 1) - 1, day ?? 1, 12),
  );
}

interface LaidOutEvent {
  event: CalendarEvent;
  topMin: number;
  heightMin: number;
  lane: number;
  laneCount: number;
}

function layoutDayEvents(dayEvents: CalendarEvent[]): LaidOutEvent[] {
  const items = dayEvents
    .map((event) => {
      const start = parseTimeMinutes(event.startTime) ?? GRID_START_MIN;
      const end = parseTimeMinutes(event.endTime) ?? Math.min(GRID_END_MIN, start + 60);
      const clampedStart = Math.min(Math.max(start, GRID_START_MIN), GRID_END_MIN - 30);
      const clampedEnd = Math.min(Math.max(end, clampedStart + 30), GRID_END_MIN);
      return {
        event,
        startMin: clampedStart,
        endMin: clampedEnd,
        topMin: clampedStart - GRID_START_MIN,
        heightMin: clampedEnd - clampedStart,
        lane: 0,
      };
    })
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  const laneEnds: number[] = [];
  for (const item of items) {
    let lane = laneEnds.findIndex((end) => end <= item.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.endMin);
    } else {
      laneEnds[lane] = item.endMin;
    }
    item.lane = lane;
  }
  const laneCount = Math.max(1, laneEnds.length);
  return items.map((item) => ({ ...item, laneCount }));
}

export function CalendarPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<ViewMode>('month');
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const todayOnly = toDateOnlyString(new Date());

  // Visible range for the current view; fetched from the real calendar API (never the whole table).
  const range = useMemo(() => {
    if (view === 'day') {
      const from = toDateOnlyString(cursor);
      return { from, to: from };
    }
    if (view === 'week') {
      const start = startOfWeekMonday(cursor);
      return { from: toDateOnlyString(start), to: toDateOnlyString(addDaysDate(start, 6)) };
    }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12);
    const gridStart = startOfWeekMonday(first);
    return { from: toDateOnlyString(gridStart), to: toDateOnlyString(addDaysDate(gridStart, 41)) };
  }, [view, cursor]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchCalendarEvents(range.from, range.to)
      .then((result) => {
        if (!cancelled) setEvents(result);
      })
      .catch(() => {
        if (!cancelled) setError('Unable to load events for this period.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const list = map.get(event.date) ?? [];
      list.push(event);
      map.set(event.date, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return map;
  }, [events]);

  const monthCells: DayCell[] = useMemo(() => {
    const cells: DayCell[] = [];
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12);
    const gridStart = startOfWeekMonday(first);
    for (let i = 0; i < 42; i += 1) {
      const date = addDaysDate(gridStart, i);
      const iso = toDateOnlyString(date);
      cells.push({
        date: iso,
        day: date.getDate(),
        inCurrentMonth: date.getMonth() === cursor.getMonth(),
        isToday: iso === todayOnly,
      });
    }
    return cells;
  }, [cursor, todayOnly]);

  const weekDays: DayCell[] = useMemo(() => {
    const start = startOfWeekMonday(cursor);
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDaysDate(start, i);
      const iso = toDateOnlyString(date);
      return { date: iso, day: date.getDate(), inCurrentMonth: true, isToday: iso === todayOnly };
    });
  }, [cursor, todayOnly]);

  const navigatePeriod = (direction: -1 | 1) => {
    setCursor((current) => {
      if (view === 'month') return new Date(current.getFullYear(), current.getMonth() + direction, 1, 12);
      if (view === 'week') return addDaysDate(current, direction * 7);
      return addDaysDate(current, direction);
    });
  };

  const timelineDays: DayCell[] = view === 'day'
    ? [{ date: toDateOnlyString(cursor), day: cursor.getDate(), inCurrentMonth: true, isToday: toDateOnlyString(cursor) === todayOnly }]
    : weekDays;

  const title =
    view === 'month'
      ? `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`
      : view === 'week'
        ? `Week of ${formatDayMonth(weekDays[0]?.date ?? toDateOnlyString(cursor))}`
        : formatDayLong(toDateOnlyString(cursor));

  const createForDate = (date: string) => navigate(`/events/new?date=${date}`);
  const monthInputValue = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;

  return (
    <div className="space-y-5">
      {/* Header — spec: Calendar + subtitle, right-side Create Event */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-primary-soft text-primary-deep">
            <CalendarIcon className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink">Calendar</h1>
            <p className="mt-1 text-sm text-secondary">Manage events, schedules and material planning</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate('/events/new')}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lift transition hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <PlusIcon className="h-4 w-4" />
          Create Event
        </button>
      </div>

      {/* Toolbar — navigation + view switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => navigatePeriod(-1)}
            aria-label="Previous period"
            className="rounded-xl border border-border-strong/60 p-2.5 text-ink transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>

          {view === 'month' ? (
            <label className="relative inline-flex min-w-[180px] cursor-pointer select-none items-center justify-center rounded-xl px-4 py-2 text-lg font-bold tracking-tight text-ink transition hover:bg-background focus-within:ring-2 focus-within:ring-primary/40" title="Jump to a month">
              <span aria-hidden="true">{title}</span>
              <input
                type="month"
                value={monthInputValue}
                aria-label="Choose month and year"
                onChange={(e) => {
                  const [y, m] = e.target.value.split('-').map(Number);
                  if (y && m) setCursor(new Date(y, m - 1, 1, 12));
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
          ) : (
            <span className="inline-flex min-w-[180px] select-none items-center justify-center px-4 py-2 text-lg font-bold tracking-tight text-ink">{title}</span>
          )}

          <button
            type="button"
            onClick={() => navigatePeriod(1)}
            aria-label="Next period"
            className="rounded-xl border border-border-strong/60 p-2.5 text-ink transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setCursor(new Date())}
            className="ml-1 rounded-xl border border-border-strong/60 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-ink transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            Today
          </button>
        </div>

        <div className="flex items-center rounded-xl border border-border-strong/60 bg-card p-1" role="tablist" aria-label="Calendar view">
          {(['month', 'week', 'day'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={view === mode}
              onClick={() => setView(mode)}
              className={`rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider capitalize transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                view === mode ? 'bg-primary text-primary-foreground shadow-sm' : 'text-secondary hover:text-ink'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Status legend — text + colour, never colour alone */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-medium text-secondary">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Legend</span>
        {([
          ['DRAFT', 'Draft', '#64748b'],
          ['PLANNING', 'Planning', '#f59e0b'],
          ['READY', 'Ready', '#0ea5e9'],
          ['COMPLETED', 'Completed', '#059669'],
          ['CANCELLED', 'Cancelled', '#e11d48'],
        ] as const).map(([status, label, color]) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            {label}
          </span>
        ))}
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger">
          <span>{error}</span>
          <button type="button" onClick={() => setCursor((c) => new Date(c))} className="font-semibold underline underline-offset-2">Retry</button>
        </div>
      )}

      {isLoading ? (
        <div className="rounded-2xl border border-border bg-card p-4" aria-label="Loading calendar">
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 42 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl sm:h-28" />
            ))}
          </div>
        </div>
      ) : view === 'month' ? (
        <MonthView cells={monthCells} eventsByDate={eventsByDate} onCreate={createForDate} />
      ) : (
        /* Week + Day — hourly timeline on desktop; agenda list on mobile */
        <>
          <TimeGrid days={timelineDays} eventsByDate={eventsByDate} isSingleDay={view === 'day'} onCreate={createForDate} />
          <AgendaList days={timelineDays} eventsByDate={eventsByDate} onCreate={createForDate} className="md:hidden" />
        </>
      )}
    </div>
  );
}

/* ---------- Month view ---------- */

function MonthView({
  cells,
  eventsByDate,
  onCreate,
}: {
  cells: DayCell[];
  eventsByDate: Map<string, CalendarEvent[]>;
  onCreate: (date: string) => void;
}) {
  return (
    <>
      {/* Desktop grid */}
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:block">
        <div className="grid grid-cols-7 border-b border-border bg-background/70">
          {WEEKDAYS.map((day) => (
            <div key={day} className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">{day}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell) => {
            const cellEvents = eventsByDate.get(cell.date) ?? [];
            return (
              <div
                key={cell.date}
                className={`flex min-h-28 flex-col border-b border-r border-border/60 p-2 transition last:border-r-0 ${
                  cell.inCurrentMonth ? 'bg-card' : 'bg-background/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => onCreate(cell.date)}
                    title="Create event on this day"
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold tabular-nums transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                      cell.isToday ? 'bg-primary text-primary-foreground' : 'text-secondary hover:bg-primary-soft hover:text-primary-deep'
                    }`}
                  >
                    {cell.day}
                  </button>
                  {cellEvents.length > 0 && (
                    <span className="text-[10px] font-semibold text-muted">{cellEvents.length} event{cellEvents.length === 1 ? '' : 's'}</span>
                  )}
                </div>
                <ul className="mt-1.5 space-y-1">
                  {cellEvents.slice(0, 3).map((event) => (
                    <li key={event.id}>
                      <Link
                        to={`/events/${event.id}`}
                        title={`${event.name} — ${event.numberOfPeople} people — ${event.status}`}
                        className={`block truncate rounded-lg border px-2 py-1 text-[11px] font-medium leading-tight transition ${EVENT_STATUS_CHIP[event.status]}`}
                      >
                        <span className="font-bold tabular-nums">{event.startTime}</span> {event.name}
                      </Link>
                    </li>
                  ))}
                  {cellEvents.length > 3 && (
                    <li>
                      <Link to={`/events?dateFrom=${cell.date}&dateTo=${cell.date}`} className="block px-2 text-[10px] font-bold text-primary hover:underline">
                        +{cellEvents.length - 3} more →
                      </Link>
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile agenda list */}
      <AgendaList days={cells} eventsByDate={eventsByDate} onCreate={onCreate} className="md:hidden" showEmptyDays={false} />
    </>
  );
}

/* ---------- Week / Day hourly timeline (desktop) ---------- */

function TimeGrid({
  days,
  eventsByDate,
  isSingleDay,
  onCreate,
}: {
  days: DayCell[];
  eventsByDate: Map<string, CalendarEvent[]>;
  isSingleDay: boolean;
  onCreate: (date: string) => void;
}) {
  const columns = isSingleDay ? 1 : days.length;
  const template = `56px repeat(${columns}, 1fr)`;

  return (
    <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:block" role="presentation">
      {/* Day header */}
      <div className="grid border-b border-border bg-background/70" style={{ gridTemplateColumns: template }}>
        <div className="border-r border-border" />
        {days.map((cell) => (
          <button
            key={cell.date}
            type="button"
            onClick={() => onCreate(cell.date)}
            title="Create event on this day"
            className={`border-r border-border px-3 py-2.5 text-center transition last:border-r-0 hover:bg-primary-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 ${
              cell.isToday ? 'bg-primary-soft/50' : ''
            }`}
          >
            <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">{new Date(Number(cell.date.slice(0, 4)), Number(cell.date.slice(5, 7)) - 1, Number(cell.date.slice(8, 10)), 12).toLocaleString('en-GB', { weekday: 'short' })}</span>
            <span className={`mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold tabular-nums ${cell.isToday ? 'bg-primary text-primary-foreground' : 'text-ink'}`}>
              {cell.day}
            </span>
          </button>
        ))}
      </div>

      {/* Timeline body */}
      <div className="relative grid" style={{ gridTemplateColumns: template, height: HOURS.length * HOUR_PX }}>
        {/* Time labels */}
        <div className="relative border-r border-border bg-background/40" style={{ height: HOURS.length * HOUR_PX }}>
          {HOURS.map((hour) => (
            <div key={hour} className="pointer-events-none absolute right-2 select-none text-[10px] font-semibold tabular-nums text-muted" style={{ top: (hour - 6) * HOUR_PX - 6 }}>
              {formatHour(hour)}
            </div>
          ))}
        </div>

        {days.map((cell) => {
          const laidOut = layoutDayEvents(eventsByDate.get(cell.date) ?? []);
          return (
            <div key={cell.date} className="relative border-r border-border last:border-r-0" style={{ height: HOURS.length * HOUR_PX }}>
              {/* Hour rules */}
              {HOURS.map((hour) => (
                <div key={hour} className="pointer-events-none absolute left-0 right-0 border-t border-border/50" style={{ top: (hour - 6) * HOUR_PX }} />
              ))}
              {/* Events positioned by time */}
              {laidOut.map(({ event, topMin, heightMin, lane, laneCount }) => {
                const widthPct = 100 / laneCount;
                return (
                  <Link
                    key={event.id}
                    to={`/events/${event.id}`}
                    title={`${event.name} — ${event.startTime}${event.endTime ? ` to ${event.endTime}` : ''} — ${event.numberOfPeople} people — ${event.status}`}
                    className={`absolute overflow-hidden rounded-lg border px-2 py-1 text-[10px] font-medium leading-tight shadow-sm transition hover:shadow-md ${EVENT_STATUS_CHIP[event.status]}`}
                    style={{
                      top: (topMin / 60) * HOUR_PX + 2,
                      height: Math.max(((heightMin / 60) * HOUR_PX) - 4, 26),
                      left: `calc(${lane * widthPct}% + 2px)`,
                      width: `calc(${widthPct}% - 4px)`,
                    }}
                  >
                    <span className="block truncate font-bold tabular-nums">{event.startTime}{event.endTime ? `–${event.endTime}` : ''}</span>
                    <span className="block truncate">{event.name}</span>
                    {heightMin >= 60 && (
                      <span className="mt-0.5 block truncate text-[9px] opacity-80">
                        {event.numberOfPeople} people{event.location ? ` · ${event.location}` : ''}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Agenda list (mobile + used by month view on mobile) ---------- */

function AgendaList({
  days,
  eventsByDate,
  onCreate,
  className = '',
  showEmptyDays = true,
}: {
  days: DayCell[];
  eventsByDate: Map<string, CalendarEvent[]>;
  onCreate: (date: string) => void;
  className?: string;
  showEmptyDays?: boolean;
}) {
  const visibleDays = days.filter((cell) => showEmptyDays || (eventsByDate.get(cell.date) ?? []).length > 0);
  const totalEvents = days.reduce((sum, cell) => sum + (eventsByDate.get(cell.date)?.length ?? 0), 0);

  return (
    <div className={className}>
      {visibleDays.length === 0 || totalEvents === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-strong/70 bg-card p-10 text-center">
          <p className="text-base font-bold text-ink">No events in this period</p>
          <p className="mt-1 text-sm text-secondary">Plan the next Mahaprasadam or festival event.</p>
          <button type="button" onClick={() => onCreate(toDateOnlyString(new Date()))} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-dark">
            <PlusIcon className="h-4 w-4" /> Create Event
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleDays.map((cell) => {
            const cellEvents = eventsByDate.get(cell.date) ?? [];
            if (cellEvents.length === 0) return null;
            return (
              <div key={cell.date} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-secondary">{formatDayLong(cell.date)}</p>
                  <button type="button" onClick={() => onCreate(cell.date)} className="text-[11px] font-bold text-primary">+ Add</button>
                </div>
                <ul className="mt-2 divide-y divide-border/60">
                  {cellEvents.map((event) => (
                    <li key={event.id}>
                      <Link to={`/events/${event.id}`} className="flex items-center justify-between gap-3 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span aria-hidden="true" className={`h-9 w-1.5 flex-none rounded-full ${EVENT_STATUS_BAR[event.status]}`} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-ink">{event.name}</p>
                            <p className="mt-0.5 text-[11px] text-secondary">
                              {event.startTime}{event.endTime ? ` – ${event.endTime}` : ''} · {event.numberOfPeople} people
                            </p>
                          </div>
                        </div>
                        <EventStatusBadge status={event.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
