import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchMaterialReturns, type MaterialReturn, type MaterialReturnStatus } from '../features/returns/api/returns.api';
import { fetchEvents } from '../features/events/api/events.api';
import { useAuth } from '../hooks/useAuth';
import { Skeleton } from '../components/ui/Skeleton';
import { PlusIcon } from '../components/ui/icons';

/**
 * MATERIAL RETURNS — the FOURTH concept (never merged with dish materials,
 * requests or issues): "what quantity physically came back".
 *
 * Both roles land here; the backend scopes the list (admin: own events,
 * executor: own + assigned). Submitting never moves stock — only an accepted
 * return restocks inventory, and only an admin can accept/reject.
 */

const PAGE_SIZE = 20;

const STATUS_BADGE: Record<MaterialReturnStatus, string> = {
  DRAFT: 'border-slate-300 bg-slate-100 text-slate-800',
  SUBMITTED: 'border-slate-300 bg-slate-100 text-slate-800',
  PENDING_ADMIN_REVIEW: 'border-amber-300 bg-amber-100 text-amber-900',
  ACCEPTED: 'border-emerald-300 bg-emerald-100 text-emerald-900',
  PARTIALLY_ACCEPTED: 'border-sky-300 bg-sky-100 text-sky-900',
  REJECTED: 'border-red-300 bg-red-100 text-red-900',
  COMPLETED: 'border-teal-400 bg-teal-100 text-teal-900',
  CANCELLED: 'border-slate-300 bg-slate-100 text-slate-600',
};

const STATUS_LABEL: Record<MaterialReturnStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  PENDING_ADMIN_REVIEW: 'Pending Review',
  ACCEPTED: 'Accepted',
  PARTIALLY_ACCEPTED: 'Partially Accepted',
  REJECTED: 'Rejected',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

/** Tab id → list filter (backend accepts a comma list or completed flag). */
type TabId = 'all' | 'pending' | 'accepted' | 'rejected' | 'completed';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'completed', label: 'Completed' },
];

function tabFilters(tab: TabId): { status?: string; completed?: boolean } {
  switch (tab) {
    case 'pending':
      return { status: 'PENDING_ADMIN_REVIEW' };
    case 'accepted':
      return { status: 'ACCEPTED,PARTIALLY_ACCEPTED' };
    case 'rejected':
      return { status: 'REJECTED' };
    case 'completed':
      return { completed: true };
    default:
      return {};
  }
}

export function ReturnsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const navigate = useNavigate();

  const [tab, setTab] = useState<TabId>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [eventId, setEventId] = useState('');
  const [page, setPage] = useState(1);
  const [returns, setReturns] = useState<MaterialReturn[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [events, setEvents] = useState<{ id: string; name: string; eventCode: string }[]>([]);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => window.clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    fetchEvents({ pageSize: 100 })
      .then((r) => setEvents(r.events.map((e) => ({ id: e.id, name: e.name, eventCode: e.eventCode }))))
      .catch(() => setEvents([]));
  }, []);

  const filters = useMemo(
    () => ({
      ...tabFilters(tab),
      eventId: eventId || undefined,
      search: debouncedSearch || undefined,
      page,
      pageSize: PAGE_SIZE,
      sort: 'createdAt',
      order: 'desc' as const,
    }),
    [tab, eventId, debouncedSearch, page],
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchMaterialReturns(filters);
      setReturns(result.returns);
      setTotal(result.total);
    } catch {
      setError('Unable to load material returns.');
    } finally {
      setIsLoading(false);
    }
  }, [filters, retryTick]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [tab, debouncedSearch, eventId]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-primary">Returns</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Material Returns</h1>
          <p className="mt-1 text-sm text-secondary">Issued material physically coming back to the store.</p>
        </div>
        {!isAdmin && (
          <button
            type="button"
            onClick={() => navigate('/events')}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lift transition hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <PlusIcon className="h-4 w-4" />
            Return Materials (from an event)
          </button>
        )}
      </div>

      <p className="rounded-xl bg-background px-4 py-3 text-[11px] leading-relaxed text-muted">
        A return only ever contains material that was actually issued. Submitting it changes nothing in stock —
        <strong className="text-ink"> inventory is restocked only when an admin accepts the return</strong>, never more than what is still returnable.
        {isAdmin ? ' As an admin you see returns for events in your scope only.' : ' As an executor you only see the returns you raised.'}
      </p>

      {/* Tabs */}
      <div role="tablist" aria-label="Return status" className="flex flex-wrap gap-1 rounded-2xl border border-border bg-card p-1.5">
        {TABS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.id)}
              className={`rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider transition ${
                active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-secondary hover:bg-background hover:text-ink'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-4 md:grid-cols-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search code or event…"
          aria-label="Search returns"
          className="rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none transition placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/25"
        />
        <select value={eventId} onChange={(e) => setEventId(e.target.value)} aria-label="Event" className="rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary">
          <option value="">All events</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>{ev.eventCode} — {ev.name}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => { setSearch(''); setEventId(''); setTab('all'); }}
          className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-xs font-semibold text-ink transition hover:border-primary hover:text-primary"
        >
          Reset filters
        </button>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger">
          <span>{error}</span>
          <button type="button" onClick={() => setRetryTick((t) => t + 1)} className="flex-none rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-danger transition hover:bg-red-100">Retry</button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-2xl" />)}</div>
      ) : returns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-strong/70 bg-card p-12 text-center">
          <p className="text-base font-bold text-ink">No material returns found.</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-secondary">
            {tab !== 'all'
              ? 'Nothing matches this tab yet.'
              : isAdmin
                ? 'Executors raise returns for issued material; they will appear here for review.'
                : 'Open an event that has issued material and choose “Return Materials”.'}
          </p>
          <Link to="/events" className="mt-4 inline-block rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-dark">Go to Events</Link>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background text-left text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">
                  <th className="px-4 py-3">Return</th>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Raised By</th>
                  <th className="px-4 py-3 text-right">Lines</th>
                  <th className="px-4 py-3 text-right">Requested</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Requested</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {returns.map((item) => {
                  const requestedTotal = item.items.reduce((sum, line) => sum + line.requestedReturnQuantity, 0);
                  return (
                    <tr key={item.id} className="border-b border-border/60 transition last:border-0 hover:bg-background/60">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-ink">{item.returnCode}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-ink">{item.event.name}</p>
                        <p className="text-[11px] text-muted">{new Date(item.event.eventDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                      </td>
                      <td className="px-4 py-3 text-secondary">{item.requester.firstName} {item.requester.lastName}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-secondary">{item.items.length}</td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums text-ink">
                        {requestedTotal} {item.items[0]?.unitSymbol ?? ''}
                      </td>
                      <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_BADGE[item.status]}`}>{STATUS_LABEL[item.status]}</span></td>
                      <td className="px-4 py-3 text-xs tabular-nums text-muted">{new Date(item.requestedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td className="px-4 py-3 text-right"><Link to={`/returns/${item.id}`} className="rounded-lg border border-border-strong/60 px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-primary hover:text-primary">View →</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {returns.map((item) => (
              <Link key={item.id} to={`/returns/${item.id}`} className="block rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-xs font-bold text-ink">{item.returnCode}</p>
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_BADGE[item.status]}`}>{STATUS_LABEL[item.status]}</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-ink">{item.event.name}</p>
                <p className="mt-1 text-xs text-muted">{item.items.length} lines · {new Date(item.requestedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · by {item.requester.firstName} {item.requester.lastName}</p>
              </Link>
            ))}
          </div>

          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-secondary">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded-xl border border-border-strong/60 px-3 py-1.5 text-sm font-medium disabled:opacity-40">← Prev</button>
              <span className="px-2 text-xs font-semibold tabular-nums text-secondary">Page {page} of {totalPages}</span>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="rounded-xl border border-border-strong/60 px-3 py-1.5 text-sm font-medium disabled:opacity-40">Next →</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
