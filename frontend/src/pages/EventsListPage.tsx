import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchEvents, type EventFilters } from '../features/events/api/events.api';
import { EventStatusBadge } from '../features/events/components/EventStatusBadge';
import { EventCardSkeleton } from '../components/ui/Skeleton';
import type { EventListItem, EventStatus } from '../features/events/types';

const STATUS_OPTIONS: (EventStatus | '')[] = ['', 'DRAFT', 'PLANNING', 'READY', 'COMPLETED', 'CANCELLED'];
const PAGE_SIZE = 12;

function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[(m ?? 1) - 1]} ${y}`;
}

export function EventsListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<EventStatus | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filters: EventFilters = useMemo(
    () => ({
      search: search.trim() || undefined,
      status: status || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [search, status, dateFrom, dateTo, page],
  );

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchEvents(filters)
      .then((result) => {
        if (cancelled) return;
        setEvents(result.events);
        setTotal(result.total);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
        setError(msg ?? 'Unable to load events. Please check your connection and try again.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters]);

  // Reset to page 1 whenever a filter changes.
  useEffect(() => {
    setPage(1);
  }, [search, status, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-primary">Events</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Event Planning</h1>
          <p className="mt-1 text-sm text-secondary">
            Plan Mahaprasadam events, dishes and material requirements — planning only, stock is never deducted.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/events/new')}
          className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lift transition hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          + New Event
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or code…"
          aria-label="Search events"
          className="rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none transition placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/25 lg:col-span-2"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as EventStatus | '')}
          aria-label="Filter by status"
          className="rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === '' ? 'All statuses' : option}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          aria-label="From date"
          className="rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          aria-label="To date"
          className="rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
        />
      </div>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-4 rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger">
          <span>{error}</span>
          <button type="button" onClick={() => setPage(1)} className="font-semibold underline underline-offset-2">
            Retry
          </button>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <EventCardSkeleton key={index} />
          ))}
        </div>
      ) : events.length === 0 && !error ? (
        <div className="rounded-2xl border border-dashed border-border-strong/70 bg-card p-12 text-center">
          <p className="text-3xl" aria-hidden="true">🪔</p>
          <h2 className="mt-3 text-lg font-bold text-ink">No events yet</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-secondary">
            {search || status || dateFrom || dateTo
              ? 'No events match these filters. Try clearing them.'
              : 'Create your first event to start planning dishes and materials.'}
          </p>
          <button
            type="button"
            onClick={() => navigate('/events/new')}
            className="mt-5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-dark"
          >
            + Create Event
          </button>
        </div>
      ) : (
        <>
          {/* Cards (mobile/tablet) */}
          <ul className="grid grid-cols-1 gap-4 md:hidden">
            {events.map((event) => (
              <li key={event.id}>
                <Link
                  to={`/events/${event.id}`}
                  className="block rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:border-primary/40 hover:shadow-md"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">{event.eventCode}</span>
                    <EventStatusBadge status={event.status} />
                  </div>
                  <h2 className="mt-2 text-lg font-bold text-ink">{event.name}</h2>
                  <p className="mt-1 text-sm text-secondary">
                    {formatDate(event.eventDate)} · {event.startTime}
                    {event.endTime ? `–${event.endTime}` : ''} · {event.numberOfPeople} people
                  </p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-secondary">
                    <span>{event.dishCount} dishes</span>
                    <span>{event.materialLineCount} material lines</span>
                    {event.location && <span>📍 {event.location}</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* Table (desktop) */}
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background text-left text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3 text-right">People</th>
                  <th className="px-4 py-3 text-right">Dishes</th>
                  <th className="px-4 py-3 text-right">Mat.</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} className="border-b border-border/60 transition last:border-0 hover:bg-background/60">
                    <td className="px-4 py-3 font-mono text-xs text-secondary">{event.eventCode}</td>
                    <td className="px-4 py-3 font-semibold text-ink">{event.name}</td>
                    <td className="px-4 py-3 text-secondary">{formatDate(event.eventDate)}</td>
                    <td className="px-4 py-3 text-secondary">
                      {event.startTime}{event.endTime ? `–${event.endTime}` : ''}
                    </td>
                    <td className="px-4 py-3 text-right text-secondary">{event.numberOfPeople}</td>
                    <td className="px-4 py-3 text-right text-secondary">{event.dishCount}</td>
                    <td className="px-4 py-3 text-right text-secondary">{event.materialLineCount}</td>
                    <td className="px-4 py-3"><EventStatusBadge status={event.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/events/${event.id}`} className="font-semibold text-primary underline-offset-2 hover:underline">
                        Open →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-secondary">
              {total === 0 ? '0' : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} events
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-xl border border-border-strong/60 px-3 py-1.5 text-sm font-medium text-ink transition hover:border-primary hover:text-primary disabled:opacity-40"
              >
                ← Prev
              </button>
              <span className="px-2 text-xs font-semibold text-secondary">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-xl border border-border-strong/60 px-3 py-1.5 text-sm font-medium text-ink transition hover:border-primary hover:text-primary disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
