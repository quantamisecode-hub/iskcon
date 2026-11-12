import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchMaterialRequests, type MaterialRequest, type MaterialRequestStatus } from '../features/requests/api/requests.api';
import { fetchEvents } from '../features/events/api/events.api';
import { useAuth } from '../hooks/useAuth';
import { Skeleton } from '../components/ui/Skeleton';
import { PlusIcon } from '../components/ui/icons';

const PAGE_SIZE = 20;

const STATUS_BADGE: Record<MaterialRequestStatus, string> = {
  DRAFT: 'border-slate-300 bg-slate-100 text-slate-800',
  PENDING_APPROVAL: 'border-amber-300 bg-amber-100 text-amber-900',
  APPROVED: 'border-emerald-300 bg-emerald-100 text-emerald-900',
  PARTIALLY_ISSUED: 'border-sky-300 bg-sky-100 text-sky-900',
  ISSUED: 'border-teal-400 bg-teal-100 text-teal-900',
  REJECTED: 'border-red-300 bg-red-100 text-red-900',
  CANCELLED: 'border-slate-300 bg-slate-100 text-slate-600',
  CANCELLED_BY_EVENT: 'border-slate-300 bg-slate-100 text-slate-600',
};

const STATUS_LABEL: Record<MaterialRequestStatus, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved',
  PARTIALLY_ISSUED: 'Partially Issued',
  ISSUED: 'Issued',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  CANCELLED_BY_EVENT: 'Cancelled with Event',
};

export function RequestsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState<'' | MaterialRequestStatus>('');
  const [eventId, setEventId] = useState('');
  const [page, setPage] = useState(1);
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
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
      status: status || undefined,
      eventId: eventId || undefined,
      search: debouncedSearch || undefined,
      page,
      pageSize: PAGE_SIZE,
      sort: 'createdAt',
      order: 'desc' as const,
    }),
    [status, eventId, debouncedSearch, page],
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchMaterialRequests(filters);
      setRequests(result.requests);
      setTotal(result.total);
    } catch {
      setError('Unable to load material requests.');
    } finally {
      setIsLoading(false);
    }
  }, [filters, retryTick]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, eventId]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-primary">Requests</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Material Requests</h1>
          <p className="mt-1 text-sm text-secondary">Track event material requirements and approvals.</p>
        </div>
        {!isAdmin && (
          <button
            type="button"
            onClick={() => navigate('/events')}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lift transition hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <PlusIcon className="h-4 w-4" />
            Create Request (from an event)
          </button>
        )}
      </div>

      <p className="rounded-xl bg-background px-4 py-3 text-[11px] leading-relaxed text-muted">
        Requests carry the executor’s requested quantities. Approval authorises the material but never moves stock — inventory changes only when an admin performs the actual Issue/Stock-Out.
        {isAdmin ? ' As an admin you see requests for events in your scope only.' : ' As an executor you only see the requests you raised.'}
      </p>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-4 md:grid-cols-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search code or event…"
          aria-label="Search requests"
          className="rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none transition placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/25"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value as '' | MaterialRequestStatus)} aria-label="Status" className="rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary">
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="PENDING_APPROVAL">Pending Approval</option>
          <option value="APPROVED">Approved</option>
          <option value="PARTIALLY_ISSUED">Partially Issued</option>
          <option value="ISSUED">Issued</option>
          <option value="REJECTED">Rejected</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="CANCELLED_BY_EVENT">Cancelled with Event</option>
        </select>
        <select value={eventId} onChange={(e) => setEventId(e.target.value)} aria-label="Event" className="rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary">
          <option value="">All events</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>{ev.eventCode} — {ev.name}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => { setSearch(''); setStatus(''); setEventId(''); }}
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
      ) : requests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-strong/70 bg-card p-12 text-center">
          <p className="text-base font-bold text-ink">No material requests found.</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-secondary">
            {isAdmin
              ? 'Executors raise material requests for assigned events; they will appear here for review.'
              : 'Open an event with a material plan and choose “Create Material Request”.'}
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
                  <th className="px-4 py-3">Request</th>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Requested By</th>
                  <th className="px-4 py-3 text-right">Items</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => (
                  <tr key={request.id} className="border-b border-border/60 transition last:border-0 hover:bg-background/60">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-ink">{request.requestCode}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink">{request.event.name}</p>
                      <p className="text-[11px] text-muted">{new Date(request.event.eventDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                    </td>
                    <td className="px-4 py-3 text-secondary">{request.requestedBy.firstName} {request.requestedBy.lastName}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-secondary">{request.items.length}</td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_BADGE[request.status]}`}>{STATUS_LABEL[request.status]}</span></td>
                    <td className="px-4 py-3 text-xs tabular-nums text-muted">{new Date(request.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    <td className="px-4 py-3 text-right"><Link to={`/requests/${request.id}`} className="rounded-lg border border-border-strong/60 px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-primary hover:text-primary">View →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {requests.map((request) => (
              <Link key={request.id} to={`/requests/${request.id}`} className="block rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-xs font-bold text-ink">{request.requestCode}</p>
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_BADGE[request.status]}`}>{STATUS_LABEL[request.status]}</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-ink">{request.event.name}</p>
                <p className="mt-1 text-xs text-muted">{request.items.length} items · {new Date(request.event.eventDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · by {request.requestedBy.firstName} {request.requestedBy.lastName}</p>
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
