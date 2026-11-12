import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  addEventDish,
  addEventMaterial,
  cancelEvent,
  changeEventStatus,
  deleteEvent,
  fetchEvent,
  fetchEventMaterialSummary,
  fetchFoodItems,
  fetchDishes,
  fetchUnits,
  removeEventDish,
  removeEventMaterial,
  updateEventMaterial,
  type EventMaterialSummary,
  type FoodItemDropdownItem,
} from '../features/events/api/events.api';
import {
  createAdditionalMaterialRequest,
  createMaterialRequest,
  fetchMaterialRequests,
} from '../features/requests/api/requests.api';
import { createMaterialReturn, fetchReturnableLines, type ReturnableLine } from '../features/returns/api/returns.api';
import { EventStatusBadge } from '../features/events/components/EventStatusBadge';
import { EventFormModal } from '../features/events/components/EventFormModal';
import { useAuth } from '../hooks/useAuth';
import { onRealtime, SOCKET_EVENT } from '../services/realtime/socketClient';
import { MultiAddPanel, type MultiAddEntry } from '../features/events/components/MultiAddPanel';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';
import type { EventDetail, EventStatus, UnitRef } from '../features/events/types';
import { AlertCircleIcon, CalendarIcon, ChevronDownIcon, ClockIcon, GaugeIcon, LockIcon, MapPinIcon, PlusIcon, TruckIcon, UsersIcon, UtensilsIcon } from '../components/ui/icons';

const EDITABLE: ReadonlySet<EventStatus> = new Set(['DRAFT', 'PLANNING']);

/** §47 lifecycle status of an event's material, as computed by GET /material-summary. */
const LIFECYCLE_LABEL: Record<string, string> = {
  PLANNED: 'Planned',
  REQUESTED: 'Requested',
  APPROVAL_PENDING: 'Approval Pending',
  ISSUE_PENDING: 'Issue Pending',
  RETURN_RECONCILIATION_PENDING: 'Return Reconciliation Pending',
  FULLY_ISSUED: 'Fully Issued',
  CANCELLED: 'Cancelled',
};

/** Statuses of a request that still "owns" an event (one open request at a time). */
const OPEN_REQUEST_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_ISSUED'] as const;

const OPEN_REQUEST_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved — Awaiting Issue',
  PARTIALLY_ISSUED: 'Partially Issued',
};

const STATUS_ACTIONS: Partial<Record<EventStatus, { target: EventStatus; label: string; tone: 'primary' | 'danger' | 'neutral' }[]>> = {
  DRAFT: [
    { target: 'PLANNING', label: 'Start Planning', tone: 'primary' },
    { target: 'CANCELLED', label: 'Cancel Event', tone: 'danger' },
  ],
  PLANNING: [
    { target: 'READY', label: 'Mark as Ready', tone: 'primary' },
    { target: 'CANCELLED', label: 'Cancel Event', tone: 'danger' },
  ],
  READY: [
    { target: 'COMPLETED', label: 'Mark as Completed', tone: 'primary' },
    { target: 'CANCELLED', label: 'Cancel Event', tone: 'danger' },
  ],
};

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [pendingCancel, setPendingCancel] = useState(false);
  /** §28: cancellation always carries a mandatory reason (sent to POST /events/:id/cancel). */
  const [cancelReason, setCancelReason] = useState('');
  const [showCreateRequest, setShowCreateRequest] = useState(false);
  const [requestNotes, setRequestNotes] = useState('');
  const [creatingRequest, setCreatingRequest] = useState(false);
  const [requestFormError, setRequestFormError] = useState<string | null>(null);
  const [selectedLines, setSelectedLines] = useState<Record<string, boolean>>({});
  const [lineQuantities, setLineQuantities] = useState<Record<string, string>>({});
  const [openRequest, setOpenRequest] = useState<{ id: string; requestCode: string; status: string } | null>(null);
  const [foodItems, setFoodItems] = useState<FoodItemDropdownItem[]>([]);
  const [availableDishes, setAvailableDishes] = useState<{ id: string; name: string }[]>([]);
  const [units, setUnits] = useState<UnitRef[]>([]);
  // §39 material summary (computed server-side on demand, never stored).
  const [summary, setSummary] = useState<EventMaterialSummary | null>(null);
  // "Return Materials" modal (EXECUTOR only — submitting never moves stock).
  const [showReturn, setShowReturn] = useState(false);
  const [returnLines, setReturnLines] = useState<ReturnableLine[] | null>(null);
  const [returnQty, setReturnQty] = useState<Record<string, string>>({});
  const [returnReason, setReturnReason] = useState('EXTRA_MATERIAL');
  const [returnReasonNote, setReturnReasonNote] = useState('');
  const [returnNotes, setReturnNotes] = useState('');
  const [returnError, setReturnError] = useState<string | null>(null);
  const [returnBusy, setReturnBusy] = useState(false);
  // "+ Request Additional Material" modal (EXECUTOR only — a NEW request row).
  const [showAdditional, setShowAdditional] = useState(false);
  const [additionalReason, setAdditionalReason] = useState('');
  const [additionalNote, setAdditionalNote] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [additionalQty, setAdditionalQty] = useState<Record<string, string>>({});
  const [additionalSelected, setAdditionalSelected] = useState<Record<string, boolean>>({});
  const [additionalError, setAdditionalError] = useState<string | null>(null);
  const [additionalBusy, setAdditionalBusy] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const load = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const result = await fetchEvent(id);
      setEvent(result);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) setNotFound(true);
      else setError('Unable to load this event. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Open material request for this event (one open at a time per event).
  useEffect(() => {
    if (!id) return;
    fetchMaterialRequests({ eventId: id, pageSize: 1 })
      .then((r) => {
        const open = r.requests.find((req) =>
          (OPEN_REQUEST_STATUSES as readonly string[]).includes(req.status),
        );
        setOpenRequest(open ? { id: open.id, requestCode: open.requestCode, status: open.status } : null);
      })
      .catch(() => setOpenRequest(null));
  }, [id, event]);

  // Fetch dropdown data once.
  useEffect(() => {
    fetchFoodItems({ pageSize: 100 }).then(setFoodItems).catch(() => setFoodItems([]));
    fetchDishes({ isActive: true, pageSize: 100 }).then((d) => setAvailableDishes(d.dishes.map((x) => ({ id: x.id, name: x.name })))).catch(() => setAvailableDishes([]));
    fetchUnits().then((u) => setUnits(u.map((x) => ({ id: x.id, symbol: x.symbol, name: x.name })))).catch(() => setUnits([]));
  }, []);

  // §39 material summary — recomputed on every event change so issued/returned
  // figures stay truthful after an approval, issue, return or cancellation.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchEventMaterialSummary(id)
      .then((s) => { if (!cancelled) setSummary(s); })
      .catch(() => { if (!cancelled) setSummary(null); });
    return () => { cancelled = true; };
  }, [id, event]);

  // Live refresh: when another session cancels THIS event (event:cancelled),
  // reload so the cancelled panel + §39 summary appear without a manual refresh.
  useEffect(() => {
    if (!id) return;
    const unsubscribe = onRealtime('onLifecycle', (ev, payload) => {
      if (ev !== SOCKET_EVENT.EVENT_CANCELLED) return;
      if ((payload as { eventId?: string })?.eventId === id) void load();
    });
    return () => { unsubscribe(); };
  }, [id, load]);

  const isEditable = event ? EDITABLE.has(event.status) : false;

  // Per-food-item shortfall across ALL committed (non-draft) lines in this event.
  const refillNeeds = useMemo(() => {
    if (!event) return [];
    const byItem = new Map<string, { id: string; name: string; planned: number; stock: number; unit: string }>();
    for (const dish of event.dishes) {
      for (const material of dish.materials) {
        if (material.isDraft) continue; // drafts wait for stock — not counted as planned demand
        const key = material.foodItem.id;
        const existing = byItem.get(key);
        if (existing) {
          existing.planned += material.plannedQuantity;
        } else {
          byItem.set(key, {
            id: key,
            name: material.foodItem.name,
            planned: material.plannedQuantity,
            stock: material.foodItem.currentStock,
            unit: material.foodItem.unit.symbol,
          });
        }
      }
    }
    return [...byItem.values()]
      .filter((entry) => entry.planned > entry.stock)
      .map((entry) => ({
        ...entry,
        refill: Math.round((entry.planned - entry.stock) * 1000) / 1000,
        planned: Math.round(entry.planned * 1000) / 1000,
      }))
      .sort((a, b) => b.refill - a.refill);
  }, [event]);

  const showNotice = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 4000);
  };

  // Committed (non-draft) plan lines the executor can request against.
  const committedLines = useMemo(() => {
    if (!event) return [];
    return event.dishes.flatMap((d) =>
      d.materials
        .filter((m) => !m.isDraft)
        .map((m) => ({
          id: m.id,
          dishName: d.dish.name,
          name: m.foodItem.name,
          planned: m.plannedQuantity,
          unit: m.unit.symbol,
          stock: m.foodItem.currentStock,
        })),
    );
  }, [event]);

  const openCreateRequest = () => {
    const selection: Record<string, boolean> = {};
    const quantities: Record<string, string> = {};
    for (const line of committedLines) {
      selection[line.id] = true;
      quantities[line.id] = String(line.planned);
    }
    setSelectedLines(selection);
    setLineQuantities(quantities);
    setRequestFormError(null);
    setShowCreateRequest(true);
  };

  const selectedCount = committedLines.filter((line) => selectedLines[line.id]).length;

  const submitCreateRequest = () => {
    if (!event) return;
    const items: Array<{ eventMaterialId: string; requestedQuantity: number }> = [];
    for (const line of committedLines) {
      if (!selectedLines[line.id]) continue;
      const raw = (lineQuantities[line.id] ?? '').trim();
      const quantity = Number(raw);
      if (raw === '' || !Number.isFinite(quantity) || quantity <= 0) {
        setRequestFormError(`Enter a quantity greater than zero for ${line.name} (${line.dishName}).`);
        return;
      }
      items.push({ eventMaterialId: line.id, requestedQuantity: Math.round(quantity * 1000) / 1000 });
    }
    if (items.length === 0) {
      setRequestFormError('Select at least one material to request.');
      return;
    }
    setRequestFormError(null);
    setCreatingRequest(true);
    createMaterialRequest({ eventId: event.id, notes: requestNotes.trim() || null, items })
      .then((req) => {
        setShowCreateRequest(false);
        setRequestNotes('');
        setOpenRequest({ id: req.id, requestCode: req.requestCode, status: req.status });
        showNotice(`Request ${req.requestCode} created as ${req.status === 'DRAFT' ? 'Draft' : req.status}.`);
      })
      .catch((err) => {
        const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
        setRequestFormError(msg ?? 'Could not create request.');
      })
      .finally(() => setCreatingRequest(false));
  };

  // Shortfall lock — while any planned line exceeds on-hand stock, NOBODY
  // (Admin or Executor) may add more materials until it's resolved.
  const planningLocked = refillNeeds.length > 0;

  const runAction = async (fn: () => Promise<EventDetail>) => {
    setIsBusy(true);
    setActionError(null);
    try {
      const updated = await fn();
      setEvent(updated);
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setActionError(msg ?? 'Action failed. Please try again.');
    } finally {
      setIsBusy(false);
    }
  };

  /**
   * §28–§34 CANCEL — ADMIN only, reason mandatory. Uses POST /events/:id/cancel
   * (never the bare status patch), which cascades zero-issued requests to
   * CANCELLED_BY_EVENT and leaves issued history returnable. Never moves stock.
   */
  const submitCancel = () => {
    if (!event) return;
    const reason = cancelReason.trim();
    if (!reason) {
      setActionError('A cancellation reason is required.');
      return;
    }
    setPendingCancel(false);
    void runAction(() => cancelEvent(event.id, reason)).then(() => {
      setCancelReason('');
      showNotice('Event cancelled. Zero-issued requests were cancelled with it.');
    });
  };

  /**
   * §41–§46 RETURN — EXECUTOR only. POSTing creates the return at
   * PENDING_ADMIN_REVIEW; stock is untouched until an admin accepts it.
   */
  const openReturnModal = () => {
    setReturnError(null);
    setReturnQty({});
    setReturnReason('EXTRA_MATERIAL');
    setReturnReasonNote('');
    setReturnNotes('');
    setReturnLines(null);
    setShowReturn(true);
    if (!id) return;
    fetchReturnableLines(id)
      .then((r) => setReturnLines(r.lines))
      .catch(() => setReturnError('Could not load returnable material.'));
  };

  const submitReturn = () => {
    if (!event || !returnLines) return;
    const items: Array<{ foodItemId: string; quantity: number }> = [];
    for (const line of returnLines) {
      const raw = (returnQty[line.foodItemId] ?? '').trim();
      if (raw === '' || raw === '0') continue;
      const quantity = Number(raw);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        setReturnError(`Enter a quantity greater than zero for ${line.foodItemName}, or leave it blank.`);
        return;
      }
      if (quantity > line.returnableQuantity) {
        setReturnError(`Only ${line.returnableQuantity} ${line.unitSymbol} of ${line.foodItemName} is still returnable.`);
        return;
      }
      items.push({ foodItemId: line.foodItemId, quantity: Math.round(quantity * 1000) / 1000 });
    }
    if (items.length === 0) {
      setReturnError('Enter a quantity for at least one material.');
      return;
    }
    if (returnReason === 'OTHER' && !returnReasonNote.trim()) {
      setReturnError('A note is required when the reason is "Other".');
      return;
    }
    setReturnBusy(true);
    setReturnError(null);
    createMaterialReturn(event.id, {
      reason: returnReason,
      reasonNote: returnReason === 'OTHER' ? returnReasonNote.trim() : null,
      notes: returnNotes.trim() || null,
      items,
    })
      .then((created) => {
        setShowReturn(false);
        showNotice(`Return ${created.returnCode} submitted for admin review — stock unchanged.`);
      })
      .catch((err) => {
        const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
        setReturnError(msg ?? 'Could not submit the return.');
      })
      .finally(() => setReturnBusy(false));
  };

  /**
   * §35–§37 ADDITIONAL REQUEST — EXECUTOR only. Creates a NEW request row
   * (requestType ADDITIONAL) linked to the latest INITIAL; the original is
   * never mutated. Reason is mandatory; "Other" additionally needs a note.
   */
  const openAdditionalModal = () => {
    const selection: Record<string, boolean> = {};
    const quantities: Record<string, string> = {};
    for (const line of committedLines) {
      selection[line.id] = false;
      quantities[line.id] = '';
    }
    setAdditionalSelected(selection);
    setAdditionalQty(quantities);
    setAdditionalReason('');
    setAdditionalNote('');
    setAdditionalNotes('');
    setAdditionalError(null);
    setShowAdditional(true);
  };

  const submitAdditional = () => {
    if (!event) return;
    const reason = additionalReason.trim();
    if (!reason) {
      setAdditionalError('A reason for the additional request is required.');
      return;
    }
    if (reason.toUpperCase() === 'OTHER' && !additionalNote.trim()) {
      setAdditionalError('A note is required when the reason is "Other".');
      return;
    }
    const items: Array<{ eventMaterialId: string; requestedQuantity: number }> = [];
    for (const line of committedLines) {
      if (!additionalSelected[line.id]) continue;
      const raw = (additionalQty[line.id] ?? '').trim();
      const quantity = Number(raw);
      if (raw === '' || !Number.isFinite(quantity) || quantity <= 0) {
        setAdditionalError(`Enter a quantity greater than zero for ${line.name} (${line.dishName}).`);
        return;
      }
      items.push({ eventMaterialId: line.id, requestedQuantity: Math.round(quantity * 1000) / 1000 });
    }
    if (items.length === 0) {
      setAdditionalError('Select at least one material to request.');
      return;
    }
    setAdditionalBusy(true);
    setAdditionalError(null);
    createAdditionalMaterialRequest({
      eventId: event.id,
      reason,
      note: additionalNote.trim() || null,
      notes: additionalNotes.trim() || null,
      items,
    })
      .then((req) => {
        setShowAdditional(false);
        showNotice(`Additional request ${req.requestCode} submitted for approval.`);
        // Refresh the open-request chip + §39 summary.
        void load();
      })
      .catch((err) => {
        const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
        setAdditionalError(msg ?? 'Could not create the additional request.');
      })
      .finally(() => setAdditionalBusy(false));
  };

  if (isLoading) return <EventDetailSkeleton />;

  if (notFound) {
    return (
      <div className="rounded-2xl border border-border bg-card p-12 text-center">
        <h1 className="text-2xl font-bold text-ink">Event not found</h1>
        <p className="mt-2 text-sm text-secondary">This event does not exist or you don't have access to it.</p>
        <Link to="/events" className="mt-6 inline-block rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-dark">
          Back to Events
        </Link>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div role="alert" className="rounded-2xl border border-danger/25 bg-danger-soft p-8 text-center">
        <p className="text-base font-bold text-danger">Couldn't load the event</p>
        <p className="mt-2 text-sm text-danger/90">{error}</p>
        <button type="button" onClick={() => void load()} className="mt-5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-dark">
          Try Again
        </button>
      </div>
    );
  }

  const actions = STATUS_ACTIONS[event.status] ?? [];

  return (
    <div className="space-y-6">
      {/* Breadcrumb + header */}
      <div>
        <nav aria-label="Breadcrumb" className="text-xs font-medium text-secondary">
          <Link to="/events" className="transition hover:text-primary">Events</Link>
          <span aria-hidden="true" className="mx-2 text-muted">/</span>
          <span className="text-ink">{event.name}</span>
        </nav>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{event.name}</h1>
              <EventStatusBadge status={event.status} />
            </div>
            <p className="mt-1 font-mono text-xs tracking-wider text-muted">{event.eventCode}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {actions
              .filter((action) => action.target !== 'CANCELLED' || isAdmin)
              .map((action) => (
              <button
                key={action.target}
                type="button"
                disabled={isBusy}
                onClick={() => {
                  if (action.target === 'CANCELLED') {
                    setCancelReason('');
                    setActionError(null);
                    setPendingCancel(true);
                    return;
                  }
                  void runAction(() => changeEventStatus(event.id, action.target)).then(() =>
                    showNotice(`Event moved to ${action.target}.`),
                  );
                }}
                className={`rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition focus-visible:outline-none focus-visible:ring-2 disabled:opacity-60 ${
                  action.tone === 'danger'
                    ? 'border border-danger/40 text-danger hover:bg-danger-soft focus-visible:ring-danger/40'
                    : 'bg-primary text-primary-foreground hover:bg-primary-dark focus-visible:ring-primary'
                }`}
              >
                {action.label}
              </button>
            ))}
            {isEditable && (
              <>
                <button
                  type="button"
                  onClick={() => setShowEdit(true)}
                  className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-xs font-semibold text-ink transition hover:border-primary hover:text-primary"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setShowDelete(true)}
                  className="rounded-xl border border-danger/40 px-4 py-2.5 text-xs font-semibold text-danger transition hover:bg-danger-soft"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {notice && (
        <div role="status" className="rounded-xl border border-[#1e7a3c]/25 bg-[#e9f7ee] px-4 py-3 text-sm font-medium text-[#145c2c]">
          {notice}
        </div>
      )}
      {actionError && (
        <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          {actionError}
        </div>
      )}
      {!isEditable && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          This event is <strong>{event.status}</strong> — dishes and materials are locked. Review only; no further planning edits or deletions are allowed.
        </div>
      )}

      {/* §28–§34: cancellation carries its reason; issued history survives so
          material can still be returned (cancellation never moves stock). */}
      {event.status === 'CANCELLED' && (
        <div className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3.5 text-sm">
          <p className="flex flex-wrap items-center gap-2 font-semibold text-danger">
            <AlertCircleIcon className="h-4 w-4 flex-none" />
            Event cancelled
            {event.cancelledAt && (
              <span className="text-xs font-normal text-danger/80">
                on {new Date(event.cancelledAt).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}
                {event.cancelledBy ? ` by ${event.cancelledBy.firstName} ${event.cancelledBy.lastName}` : ''}
              </span>
            )}
          </p>
          {event.cancellationReason && (
            <p className="mt-1.5 text-danger/90">
              <span className="font-semibold">Reason:</span> {event.cancellationReason}
            </p>
          )}
          <p className="mt-2 text-xs leading-relaxed text-danger/80">
            Requests with no material issued were cancelled with the event. Material that <strong>was</strong> issued stays on record and can still be
            returned — cancellation never moves stock by itself.
          </p>
        </div>
      )}

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryStat
          icon={<CalendarIcon className="h-4 w-4 text-primary" />}
          label="Date"
          value={formatDateLong(event.eventDate)}
        />
        <SummaryStat
          icon={<ClockIcon className="h-4 w-4 text-primary" />}
          label="Time"
          value={formatTime12h(event.startTime, event.endTime)}
          secondary={`24h: ${event.startTime}${event.endTime ? ` – ${event.endTime}` : ''}`}
        />
        <SummaryStat
          icon={<UsersIcon className="h-4 w-4 text-primary" />}
          label="Number of People"
          value={String(event.numberOfPeople)}
        />
        <SummaryStat
          icon={<MapPinIcon className="h-4 w-4 text-primary" />}
          label="Location"
          value={event.location ?? '—'}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Event information */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">Event Information</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <InfoRow label="Event Code" value={event.eventCode} mono />
            <InfoRow label="Admin" value={`${event.admin.firstName} ${event.admin.lastName}`} />
            <InfoRow label="Created By" value={`${event.creator.firstName} ${event.creator.lastName}`} />
            <InfoRow label="Status" value={event.status} />
            <InfoRow label="Created" value={new Date(event.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} />
          </dl>
          {event.description && (
            <div className="mt-4 border-t border-border pt-4">
              <dt className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Description</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-secondary">{event.description}</dd>
            </div>
          )}
          {event.notes && (
            <div className="mt-4 border-t border-border pt-4">
              <dt className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Notes</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-secondary">{event.notes}</dd>
            </div>
          )}
          <div className="mt-4 border-t border-border pt-4">
            <dt className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Summary</dt>
            <dd className="mt-2 flex flex-wrap gap-4">
              <span className="rounded-xl bg-primary-soft/50 px-3 py-1.5 text-xs font-bold text-primary-deep">
                {event.summary.totalDishes} {event.summary.totalDishes === 1 ? 'dish' : 'dishes'}
              </span>
              <span className="rounded-xl bg-primary-soft/50 px-3 py-1.5 text-xs font-bold text-primary-deep">
                {event.summary.totalMaterialLines} material {event.summary.totalMaterialLines === 1 ? 'line' : 'lines'}
              </span>
            </dd>
          </div>
        </section>

        {/* Dishes + materials */}
        <section className="xl:col-span-2 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">Dishes &amp; Material Planning</h2>
            <div className="flex flex-wrap items-center gap-2">
              {openRequest && (
                <Link to={`/requests/${openRequest.id}`} className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-900 transition hover:bg-amber-100">
                  {openRequest.requestCode} · {OPEN_REQUEST_LABEL[openRequest.status] ?? openRequest.status} → View
                </Link>
              )}
              {!isAdmin && (
                <>
                  {!openRequest && (
                    <button
                      type="button"
                      disabled={isBusy || committedLines.length === 0}
                      title={committedLines.length === 0 ? 'Commit at least one material line first' : 'Request materials from the committed plan'}
                      onClick={openCreateRequest}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground shadow-sm transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <PlusIcon className="h-4 w-4" />
                      Create Material Request
                    </button>
                  )}
                  {/* §35–§37: a SEPARATE request row linked to the latest INITIAL. */}
                  <button
                    type="button"
                    disabled={isBusy || committedLines.length === 0 || event.status === 'CANCELLED' || event.status === 'COMPLETED'}
                    title={
                      committedLines.length === 0
                        ? 'Commit at least one material line first'
                        : event.status === 'CANCELLED' || event.status === 'COMPLETED'
                          ? 'This event no longer accepts material requests'
                          : 'Raise an additional request against the committed plan'
                    }
                    onClick={openAdditionalModal}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary-soft px-3.5 py-2 text-xs font-bold text-primary-deep shadow-sm transition hover:bg-primary-soft/70 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <PlusIcon className="h-4 w-4" />
                    Request Additional Material
                  </button>
                  {/* §41: eligibility is issued − accepted returned, so this stays
                      available even after the event is cancelled or completed. */}
                  <button
                    type="button"
                    disabled={isBusy}
                    title="Return issued material that was not used"
                    onClick={openReturnModal}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-800 shadow-sm transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <TruckIcon className="h-4 w-4" />
                    Return Materials
                  </button>
                </>
              )}
              {isEditable && (
                <AddDishControl

                    availableDishes={availableDishes.filter(
                      (d) => !event.dishes.some((ed) => ed.dishId === d.id),
                    )}
                    disabled={isBusy}
                    onAdd={(dishId) => void runAction(() => addEventDish(event.id, dishId)).then(() => showNotice('Dish added.'))}
                  />
              )}
            </div>
          </div>

          {event.dishes.length > 0 && refillNeeds.length > 0 && (
            <div className="rounded-2xl border border-l-4 border-amber-200 border-l-amber-400 bg-amber-50/60 px-5 py-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-xs font-semibold text-amber-900">
                  <AlertCircleIcon className="h-4 w-4" />
                  Stock shortfall — refill to meet this event
                </p>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-800">
                  {refillNeeds.length} item{refillNeeds.length === 1 ? '' : 's'} short
                </span>
              </div>
              <ul className="mt-3 space-y-1.5">
                {refillNeeds.map((item) => (
                  <li key={item.id} className="flex items-baseline justify-between gap-4 text-sm">
                    <span className="min-w-0 text-ink">
                      <span className="font-semibold">{item.name}</span>
                      <span className="text-secondary"> — need {item.planned} {item.unit}, have {item.stock} {item.unit}</span>
                    </span>
                    <span className="flex-none font-semibold tabular-nums text-amber-900">+{item.refill} {item.unit}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 text-[11px] leading-relaxed text-amber-900/80">
                Purchase or stock-in the shortfall before marking the event READY. Planning never deducts stock.
              </p>
            </div>
          )}

          {event.dishes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border-strong/70 bg-card p-10 text-center">
              <p className="text-base font-bold text-ink">No dishes yet</p>
              <p className="mx-auto mt-1.5 max-w-sm text-sm text-secondary">
                {isEditable ? 'Add a dish to start planning its materials.' : 'Dishes will appear here once they are added.'}
              </p>
            </div>
          ) : (
            event.dishes.map((eventDish) => (
              <DishCard
                key={eventDish.id}
                eventDish={eventDish}
                foodItems={foodItems}
                units={units}
                isEditable={isEditable}
                isBusy={isBusy}
                onChanged={(updated) => setEvent(updated)}
                onNotice={showNotice}
                onError={setActionError}
                onRemove={() =>
                  void runAction(() => removeEventDish(event.id, eventDish.id)).then(() => showNotice('Dish removed.'))
                }
                planningLocked={planningLocked}
                isAdmin={isAdmin}
              />
            ))
          )}
        </section>
      </div>

      {/* §39 MATERIAL SUMMARY — computed live by the server, never stored.
          Shows the four distinct concepts side by side: plan, request,
          issue, return. Read-only for both roles. */}
      {summary && summary.lines.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">Material Summary</h2>
              <p className="mt-1 text-[11px] text-muted">Planned vs requested vs approved vs issued vs returned — approval never deducts stock.</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border-strong/60 bg-background px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-secondary">
              <GaugeIcon className="h-3.5 w-3.5" />
              {LIFECYCLE_LABEL[summary.lifecycleStatus] ?? summary.lifecycleStatus}
            </span>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-border bg-background text-left text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">
                  <th className="px-4 py-3">Material</th>
                  <th className="px-4 py-3 text-right">Planned</th>
                  <th className="px-4 py-3 text-right">Requested</th>
                  <th className="px-4 py-3 text-right">Approved</th>
                  <th className="px-4 py-3 text-right">Issued</th>
                  <th className="px-4 py-3 text-right">Returned</th>
                  <th className="px-4 py-3 text-right">Unreturned</th>
                  <th className="px-4 py-3 text-right">Pending Approval</th>
                  <th className="px-4 py-3 text-right">In Stock</th>
                </tr>
              </thead>
              <tbody>
                {summary.lines.map((line) => (
                  <tr key={line.foodItemId} className="border-b border-border/60 last:border-0 hover:bg-background/60">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink">{line.foodItemName}</p>
                      <p className="text-[11px] text-muted">{line.unitSymbol}</p>
                    </td>
                    <SummaryCell value={line.plannedQuantity} />
                    <SummaryCell value={line.requestedQuantity} />
                    <SummaryCell value={line.approvedQuantity} />
                    <SummaryCell value={line.issuedQuantity} strong />
                    <SummaryCell value={line.returnedQuantity} tone="text-emerald-700" />
                    <SummaryCell value={line.returnableQuantity} tone={line.returnableQuantity > 0 ? 'text-amber-800' : 'text-muted'} />
                    <SummaryCell value={line.pendingApprovalQuantity} />
                    <SummaryCell value={line.availableStock} tone="text-secondary" />
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-background/70 text-[11px] font-bold uppercase tracking-wider text-ink">
                  <td className="px-4 py-3">Totals</td>
                  <SummaryCell value={summary.totals.plannedQuantity} />
                  <SummaryCell value={summary.totals.requestedQuantity} />
                  <SummaryCell value={summary.totals.approvedQuantity} />
                  <SummaryCell value={summary.totals.issuedQuantity} strong />
                  <SummaryCell value={summary.totals.returnedQuantity} tone="text-emerald-700" />
                  <SummaryCell value={summary.totals.returnableQuantity} tone="text-amber-800" />
                  <SummaryCell value={summary.totals.pendingApprovalQuantity} />
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            <strong className="text-ink">Unreturned</strong> is issued material still out there — the quantity that may still be returned.
            Stock changes only when material is issued out or an admin accepts a return.
          </p>
        </section>
      )}

      {showEdit && (
        <EventFormModal
          mode="edit"
          event={event}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => {
            setEvent(updated);
            setShowEdit(false);
            showNotice('Event updated.');
          }}
        />
      )}

      {pendingCancel && (
        <Modal title="Cancel Event?" onClose={() => setPendingCancel(false)} maxWidthClass="max-w-md">
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-secondary">
              <strong className="text-ink">{event.name}</strong> will no longer appear as an active planned event.
              Its dishes and material plan remain on record as history.
            </p>
            <ul className="space-y-1.5 rounded-xl border border-border bg-background px-4 py-3 text-[11px] leading-relaxed text-secondary">
              <li>• Requests with <strong className="text-ink">no material issued</strong> are cancelled with the event.</li>
              <li>• Requests that already issued material <strong className="text-ink">stay open</strong> so the executor can return it.</li>
              <li>• <strong className="text-ink">No stock is moved</strong> by cancelling — returns still restock accepted quantities.</li>
            </ul>

            <div>
              <label htmlFor="cancel-reason" className="mb-1.5 block text-xs font-semibold text-ink">
                Reason <span className="text-danger">*</span>
              </label>
              <textarea
                id="cancel-reason"
                rows={3}
                maxLength={1000}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Why is this event being cancelled?"
                className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none transition placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/25"
              />
              <p className="mt-1 text-[11px] text-muted">{cancelReason.length}/1000 · required — recorded on the event and in the audit trail.</p>
            </div>

            {actionError && <p role="alert" className="text-xs font-semibold text-danger">{actionError}</p>}

            <div className="flex items-center justify-end gap-3">
              <button type="button" onClick={() => setPendingCancel(false)} className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-background">
                Keep Event
              </button>
              <button
                type="button"
                disabled={isBusy || cancelReason.trim() === ''}
                onClick={submitCancel}
                className="rounded-xl bg-danger px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isBusy ? 'Cancelling…' : 'Cancel Event'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showCreateRequest && !isAdmin && event && (
        <Modal title="Create Material Request" onClose={() => setShowCreateRequest(false)} maxWidthClass="max-w-2xl">
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-secondary">
              Choose the materials you need from <strong className="text-ink">{event.name}</strong>’s committed plan and enter the quantity for each.
              You can only request lines that already exist in the plan. <strong className="text-ink">No stock is deducted</strong> — the admin approves first, and stock moves only when they issue it.
            </p>

            <div className="max-h-72 overflow-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0">
                  <tr className="border-b border-border bg-background text-left text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">
                    <th className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        aria-label="Select all materials"
                        checked={committedLines.length > 0 && selectedCount === committedLines.length}
                        onChange={(e) => {
                          const on = e.target.checked;
                          const next: Record<string, boolean> = {};
                          for (const line of committedLines) next[line.id] = on;
                          setSelectedLines(next);
                        }}
                        className="h-4 w-4 rounded border-border-strong accent-[var(--color-primary,#1e7a3c)]"
                      />
                    </th>
                    <th className="px-3 py-2.5">Material</th>
                    <th className="px-3 py-2.5">Dish</th>
                    <th className="px-3 py-2.5 text-right">Planned</th>
                    <th className="px-3 py-2.5 text-right">In Stock</th>
                    <th className="px-3 py-2.5 text-right">Requested Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {committedLines.map((line) => {
                    const checked = !!selectedLines[line.id];
                    return (
                      <tr key={line.id} className={`border-b border-border/60 last:border-0 ${checked ? '' : 'opacity-55'}`}>
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            aria-label={`Request ${line.name} (${line.dishName})`}
                            checked={checked}
                            onChange={(e) => setSelectedLines((prev) => ({ ...prev, [line.id]: e.target.checked }))}
                            className="h-4 w-4 rounded border-border-strong accent-[var(--color-primary,#1e7a3c)]"
                          />
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-ink">{line.name}</td>
                        <td className="px-3 py-2.5 text-xs text-secondary">{line.dishName}</td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-ink">
                          {line.planned} {line.unit}
                        </td>
                        <td className={`px-3 py-2.5 text-right tabular-nums ${line.stock >= line.planned ? 'text-secondary' : 'font-semibold text-amber-800'}`}>
                          {line.stock} {line.unit}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <input
                            type="number"
                            min={0}
                            step="any"
                            disabled={!checked}
                            value={lineQuantities[line.id] ?? ''}
                            onChange={(e) => setLineQuantities((prev) => ({ ...prev, [line.id]: e.target.value }))}
                            aria-label={`Requested quantity for ${line.name}`}
                            className="w-24 rounded-lg border border-border-strong/70 bg-white px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:border-primary disabled:bg-background disabled:text-muted"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-muted">
              {selectedCount} of {committedLines.length} line{committedLines.length === 1 ? '' : 's'} selected · defaults to the planned quantity.
            </p>

            <div>
              <label htmlFor="request-notes" className="mb-1.5 block text-xs font-semibold text-ink">Notes (optional)</label>
              <textarea id="request-notes" rows={2} value={requestNotes} onChange={(e) => setRequestNotes(e.target.value)} placeholder="Anything the approver should know" className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary" />
            </div>

            {requestFormError && <p role="alert" className="text-xs font-semibold text-danger">{requestFormError}</p>}

            <div className="flex items-center justify-end gap-3">
              <button type="button" onClick={() => setShowCreateRequest(false)} className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-background">Cancel</button>
              <button
                type="button"
                disabled={creatingRequest}
                onClick={submitCreateRequest}
                className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-dark disabled:opacity-70"
              >
                {creatingRequest ? 'Creating…' : 'Create Draft Request'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* §41–§46 RETURN MATERIALS — EXECUTOR only. Loading returnable lines
          live from the server; posting never moves stock. */}
      {showReturn && (
        <Modal title="Return Materials" onClose={() => setShowReturn(false)} maxWidthClass="max-w-2xl">
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-secondary">
              Return material that was issued for <strong className="text-ink">{event.name}</strong> but not used.
              You can only return what is <strong className="text-ink">still returnable</strong> (issued minus what has already been accepted back).
              <strong className="text-ink"> Submitting does not change stock</strong> — an admin must accept the return first.
            </p>

            {!returnLines ? (
              <div role="status" aria-label="Loading returnable material" className="space-y-2 py-2">
                <Skeleton className="h-10 rounded-xl" />
                <Skeleton className="h-10 rounded-xl" />
              </div>
            ) : returnLines.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border-strong/70 bg-background p-6 text-center">
                <p className="text-sm font-bold text-ink">Nothing left to return.</p>
                <p className="mx-auto mt-1 max-w-md text-xs text-secondary">
                  Every quantity issued for this event has already been returned and accepted.
                </p>
              </div>
            ) : (
              <div className="max-h-72 overflow-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0">
                    <tr className="border-b border-border bg-background text-left text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">
                      <th className="px-3 py-2.5">Material</th>
                      <th className="px-3 py-2.5 text-right">Returnable</th>
                      <th className="px-3 py-2.5 text-right">Return Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returnLines.map((line) => (
                      <tr key={line.foodItemId} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2.5">
                          <p className="font-semibold text-ink">{line.foodItemName}</p>
                          <p className="text-[11px] text-muted">In stock: {line.availableStock} {line.unitSymbol}</p>
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-emerald-700">
                          {line.returnableQuantity} {line.unitSymbol}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <input
                            type="number"
                            min={0}
                            max={line.returnableQuantity}
                            step="any"
                            value={returnQty[line.foodItemId] ?? ''}
                            onChange={(e) => setReturnQty((prev) => ({ ...prev, [line.foodItemId]: e.target.value }))}
                            aria-label={`Quantity of ${line.foodItemName} to return`}
                            className="w-24 rounded-lg border border-border-strong/70 bg-white px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:border-primary"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="return-reason" className="mb-1.5 block text-xs font-semibold text-ink">Reason</label>
                <select
                  id="return-reason"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary"
                >
                  <option value="EXTRA_MATERIAL">Extra material issued</option>
                  <option value="SPOILAGE">Spoilage / damage</option>
                  <option value="QUALITY">Quality issue</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              {returnReason === 'OTHER' && (
                <div>
                  <label htmlFor="return-reason-note" className="mb-1.5 block text-xs font-semibold text-ink">
                    Note <span className="text-danger">*</span>
                  </label>
                  <input
                    id="return-reason-note"
                    type="text"
                    maxLength={500}
                    value={returnReasonNote}
                    onChange={(e) => setReturnReasonNote(e.target.value)}
                    placeholder="Required when the reason is Other"
                    className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary"
                  />
                </div>
              )}
            </div>

            <div>
              <label htmlFor="return-notes" className="mb-1.5 block text-xs font-semibold text-ink">Notes (optional)</label>
              <textarea
                id="return-notes"
                rows={2}
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                placeholder="Anything the reviewing admin should know"
                className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary"
              />
            </div>

            {returnError && <p role="alert" className="text-xs font-semibold text-danger">{returnError}</p>}

            <div className="flex items-center justify-end gap-3">
              <button type="button" onClick={() => setShowReturn(false)} className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-background">
                Cancel
              </button>
              <button
                type="button"
                disabled={returnBusy || !returnLines}
                onClick={submitReturn}
                className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-dark disabled:opacity-70"
              >
                {returnBusy ? 'Submitting…' : 'Submit Return for Review'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* §35–§37 ADDITIONAL REQUEST — EXECUTOR only. A NEW request row
          (ADDITIONAL) linked to the latest INITIAL; the original never changes. */}
      {showAdditional && (
        <Modal title="Request Additional Material" onClose={() => setShowAdditional(false)} maxWidthClass="max-w-2xl">
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-secondary">
              Need more than the plan for <strong className="text-ink">{event.name}</strong>? This raises a <strong className="text-ink">separate</strong> request
              linked to your original one — the original request is never modified.
              <strong className="text-ink"> No stock is deducted</strong>; the admin approves first and stock moves only on issue.
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="additional-reason" className="mb-1.5 block text-xs font-semibold text-ink">
                  Reason <span className="text-danger">*</span>
                </label>
                <select
                  id="additional-reason"
                  value={additionalReason}
                  onChange={(e) => setAdditionalReason(e.target.value)}
                  className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary"
                >
                  <option value="">Select a reason…</option>
                  <option value="More people than planned">More people than planned</option>
                  <option value="Extra servings">Extra servings</option>
                  <option value="Wastage">Wastage</option>
                  <option value="Spoilage">Spoilage</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              {additionalReason === 'Other' && (
                <div>
                  <label htmlFor="additional-note" className="mb-1.5 block text-xs font-semibold text-ink">
                    Note <span className="text-danger">*</span>
                  </label>
                  <input
                    id="additional-note"
                    type="text"
                    maxLength={500}
                    value={additionalNote}
                    onChange={(e) => setAdditionalNote(e.target.value)}
                    placeholder="Required when the reason is Other"
                    className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary"
                  />
                </div>
              )}
            </div>

            <div className="max-h-72 overflow-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0">
                  <tr className="border-b border-border bg-background text-left text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">
                    <th className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        aria-label="Select all materials"
                        checked={committedLines.length > 0 && committedLines.every((l) => additionalSelected[l.id])}
                        onChange={(e) => {
                          const on = e.target.checked;
                          const next: Record<string, boolean> = {};
                          for (const line of committedLines) next[line.id] = on;
                          setAdditionalSelected(next);
                        }}
                        className="h-4 w-4 rounded border-border-strong accent-[var(--color-primary,#1e7a3c)]"
                      />
                    </th>
                    <th className="px-3 py-2.5">Material</th>
                    <th className="px-3 py-2.5">Dish</th>
                    <th className="px-3 py-2.5 text-right">Planned</th>
                    <th className="px-3 py-2.5 text-right">Additional Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {committedLines.map((line) => {
                    const checked = !!additionalSelected[line.id];
                    return (
                      <tr key={line.id} className={`border-b border-border/60 last:border-0 ${checked ? '' : 'opacity-55'}`}>
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            aria-label={`Request more ${line.name} (${line.dishName})`}
                            checked={checked}
                            onChange={(e) => setAdditionalSelected((prev) => ({ ...prev, [line.id]: e.target.checked }))}
                            className="h-4 w-4 rounded border-border-strong accent-[var(--color-primary,#1e7a3c)]"
                          />
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-ink">{line.name}</td>
                        <td className="px-3 py-2.5 text-xs text-secondary">{line.dishName}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-secondary">{line.planned} {line.unit}</td>
                        <td className="px-3 py-2.5 text-right">
                          <input
                            type="number"
                            min={0}
                            step="any"
                            disabled={!checked}
                            value={additionalQty[line.id] ?? ''}
                            onChange={(e) => setAdditionalQty((prev) => ({ ...prev, [line.id]: e.target.value }))}
                            aria-label={`Additional quantity for ${line.name}`}
                            className="w-24 rounded-lg border border-border-strong/70 bg-white px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:border-primary disabled:bg-background disabled:text-muted"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div>
              <label htmlFor="additional-notes" className="mb-1.5 block text-xs font-semibold text-ink">Notes (optional)</label>
              <textarea
                id="additional-notes"
                rows={2}
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
                placeholder="Anything the approver should know"
                className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary"
              />
            </div>

            {additionalError && <p role="alert" className="text-xs font-semibold text-danger">{additionalError}</p>}

            <div className="flex items-center justify-end gap-3">
              <button type="button" onClick={() => setShowAdditional(false)} className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-background">
                Cancel
              </button>
              <button
                type="button"
                disabled={additionalBusy}
                onClick={submitAdditional}
                className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-dark disabled:opacity-70"
              >
                {additionalBusy ? 'Submitting…' : 'Submit Additional Request'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showDelete && (
        <Modal title="Delete event?" onClose={() => setShowDelete(false)} maxWidthClass="max-w-md">
          <p className="text-sm leading-relaxed text-secondary">
            This will permanently delete <strong className="text-ink">{event.name}</strong> and its planned dishes and materials.
            Food items, stock and history are not affected.
          </p>
          <div className="mt-5 flex items-center justify-end gap-3">
            <button type="button" onClick={() => setShowDelete(false)} className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-background">
              Keep Event
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                setIsBusy(true);
                deleteEvent(event.id)
                  .then(() => navigate('/events', { replace: true }))
                  .catch(() => {
                    setActionError('Could not delete the event. Please try again.');
                    setIsBusy(false);
                    setShowDelete(false);
                  });
              }}
              className="rounded-xl bg-danger px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-800 disabled:opacity-60"
            >
              {isBusy ? 'Deleting…' : 'Delete Event'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------- Dish card with materials ---------- */

function DishCard({
  eventDish,
  foodItems,
  units,
  isEditable,
  isBusy,
  onChanged,
  onNotice,
  onError,
  onRemove,
  planningLocked,
  isAdmin,
}: {
  eventDish: EventDetail['dishes'][number];
  foodItems: FoodItemDropdownItem[];
  units: UnitRef[];
  isEditable: boolean;
  isBusy: boolean;
  onChanged: (updated: EventDetail) => void;
  onNotice: (msg: string) => void;
  onError: (msg: string | null) => void;
  onRemove: () => void;
  planningLocked: boolean;
  isAdmin: boolean;
}) {
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const availableItems = useMemo(
    () =>
      foodItems
        .filter((fi) => !eventDish.materials.some((material) => material.foodItem.id === fi.id))
        .map((fi) => ({
          id: fi.id,
          name: fi.name,
          stock: fi.currentStock,
          unit: fi.unit.symbol,
          unitId: fi.unit.id,
        })),
    [foodItems, eventDish.materials],
  );

  const stockById = useMemo(() => new Map(availableItems.map((fi) => [fi.id, fi.stock])), [availableItems]);

  const handleAddMaterials = async (entries: MultiAddEntry[], forceDraft: boolean): Promise<void> => {
    setLocalError(null);
    setIsAdding(true);
    let updated: EventDetail | null = null;
    const failed: string[] = [];
    let addedCount = 0;
    let draftedCount = 0;
    for (const entry of entries) {
      // Auto-split: in-stock lines are added to the plan; short lines go to the draft automatically.
      const stock = stockById.get(entry.foodItemId) ?? 0;
      const wantsNormal = !forceDraft && entry.quantity <= stock;
      const name = foodItems.find((fi) => fi.id === entry.foodItemId)?.name ?? entry.foodItemId;
      const attempt = async (isDraft: boolean) => {
        updated = await addEventMaterial(eventDish.id, {
          foodItemId: entry.foodItemId,
          plannedQuantity: entry.quantity,
          unitId: entry.unitId,
          isDraft,
        });
        if (isDraft) draftedCount += 1;
        else addedCount += 1;
      };
      try {
        await attempt(!wantsNormal);
      } catch (err) {
        const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? '';
        // Stale client stock — the server refused the normal add, retry as draft.
        if (wantsNormal && /not enough stock/i.test(msg)) {
          try {
            await attempt(true);
            continue;
          } catch (err2) {
            const msg2 = (err2 as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
            failed.push(msg2 ?? name);
            continue;
          }
        }
        failed.push(msg || name);
      }
    }
    setIsAdding(false);
    if (updated) onChanged(updated);
    if (failed.length > 0) {
      setLocalError(failed.length === entries.length ? `Could not add: ${failed.join(', ')}` : `Skipped: ${failed.join('; ')}`);
      return;
    }
    setShowAddMaterial(false);
    if (forceDraft) {
      onNotice(`Saved ${draftedCount} line${draftedCount === 1 ? '' : 's'} to draft — add them once the item is in stock.`);
      return;
    }
    const parts: string[] = [];
    if (addedCount > 0) parts.push(`added ${addedCount} material${addedCount === 1 ? '' : 's'}`);
    if (draftedCount > 0) parts.push(`${draftedCount} sent to draft (short on stock)`);
    onNotice(`${parts.join(' · ')} — stock unchanged.`);
  };

  return (
    <article className="animate-card-in overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-background/60 px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-primary-soft text-sm font-bold text-primary-deep">
            {eventDish.displayOrder}
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-ink">{eventDish.dish.name}</h3>
            {eventDish.notes && <p className="truncate text-xs text-secondary">{eventDish.notes}</p>}
          </div>
        </div>
        {isEditable && (
          <button
            type="button"
            onClick={onRemove}
            disabled={isBusy}
            aria-label={`Remove ${eventDish.dish.name}`}
            className="rounded-lg p-2 text-muted transition hover:bg-red-50 hover:text-danger disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-5 w-5" aria-hidden="true">
              <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a2 2 0 0 0 2 1.8h6a2 2 0 0 0 2-1.8l1-13M9 7V4h6v3" />
            </svg>
          </button>
        )}
      </header>

      {eventDish.materials.length === 0 && !showAddMaterial ? (
        <p className="px-5 py-6 text-center text-xs text-secondary">No materials planned for this dish yet.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {eventDish.materials.map((material) => (
            <MaterialRow
              key={material.id}
              material={material}
              units={units}
              isEditable={isEditable}
              isBusy={isBusy}
              isAdmin={isAdmin}
              onChanged={onChanged}
              onError={onError}
              onNotice={onNotice}
              eventDishId={eventDish.id}
            />
          ))}
        </ul>
      )}

      {isEditable && (
        <div className="border-t border-border px-5 py-3">
          {showAddMaterial ? (
            <MultiAddPanel
              items={availableItems}
              isSubmitting={isAdding}
              onSubmit={(entries) => handleAddMaterials(entries, false)}
              onAddToDraft={(entries) => handleAddMaterials(entries, true)}
              autoSplitToDraft
              locked={planningLocked}
              lockedMessage="Shortfall unresolved — stock in the short items above (or remove the short line) before adding more. Admins and Executors are both blocked."
              onCancel={() => {
                setShowAddMaterial(false);
                setLocalError(null);
              }}
            />
          ) : planningLocked ? (
            <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-[11px] font-semibold leading-snug text-amber-900">
              <LockIcon className="mt-0.5 h-4 w-4 flex-none" />
              <span>
                Add Materials is locked while there's a shortfall — stock in the short items (see the amber banner above)
                or remove the short line. Applies to Admins and Executors.
              </span>
            </div>
          ) : (
            <button type="button" onClick={() => setShowAddMaterial(true)} className="text-xs font-bold text-primary underline-offset-2 hover:underline">
              + Add Materials
            </button>
          )}
          {localError && <p role="alert" className="mt-2 text-xs font-semibold text-danger">{localError}</p>}
        </div>
      )}
    </article>
  );
}

/* ---------- Material row with inline edit ---------- */

function MaterialRow({
  material,
  units,
  isEditable,
  isBusy,
  onChanged,
  onError,
  onNotice,
  eventDishId,
  isAdmin,
}: {
  material: EventDetail['dishes'][number]['materials'][number];
  units: UnitRef[];
  isEditable: boolean;
  isBusy: boolean;
  onChanged: (updated: EventDetail) => void;
  onError: (msg: string | null) => void;
  onNotice: (msg: string) => void;
  eventDishId: string;
  isAdmin: boolean;
}) {
  const [quantity, setQuantity] = useState(String(material.plannedQuantity));
  const [unitId, setUnitId] = useState(material.unit.id);
  const [isSaving, setIsSaving] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);

  const stock = material.foodItem.currentStock;
  const plannedValue = Number.parseFloat(quantity);
  const plannedEffective = Number.isFinite(plannedValue) && plannedValue > 0 ? plannedValue : 0;
  const shortfall = Math.max(0, plannedEffective - stock);
  const dirty = quantity !== String(material.plannedQuantity) || unitId !== material.unit.id;
  const savedShortfall = Math.max(0, material.plannedQuantity - stock);
  const canCommit = stock >= material.plannedQuantity;

  const commit = async () => {
    setIsCommitting(true);
    onError(null);
    try {
      const updated = await updateEventMaterial(eventDishId, material.id, { isDraft: false });
      onChanged(updated);
      onNotice(`“${material.foodItem.name}” added to the plan.`);
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      onError(msg ?? 'Could not add the item — stock may still be short.');
    } finally {
      setIsCommitting(false);
    }
  };

  const save = async () => {
    const qty = Number.parseFloat(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      onError('Quantity must be greater than zero.');
      return;
    }
    setIsSaving(true);
    onError(null);
    try {
      const updated = await updateEventMaterial(eventDishId, material.id, {
        plannedQuantity: qty,
        unitId,
      });
      onChanged(updated);
      onNotice('Material updated (stock unchanged).');
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      onError(msg ?? 'Could not update the material.');
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async () => {
    setIsSaving(true);
    onError(null);
    try {
      const updated = await removeEventMaterial(eventDishId, material.id);
      onChanged(updated);
      onNotice('Material removed.');
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      onError(msg ?? 'Could not remove the material.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <li className={`flex flex-wrap items-center gap-3 px-5 py-3 ${material.isDraft ? 'bg-amber-50/60' : shortfall > 0 ? 'bg-amber-50/70' : ''}`}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">
          {material.foodItem.name}
          {material.isDraft && (
            <span className="ml-2 inline-flex items-center align-middle rounded-full border border-amber-400 bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-900">Draft</span>
          )}
        </p>
        <p className="mt-0.5 text-[11px] text-secondary">
          Stock: <span className="font-semibold text-ink">{stock} {material.foodItem.unit.symbol}</span>
          {material.isDraft ? (
            <span className="ml-2 font-semibold text-amber-800">· waiting for stock{savedShortfall > 0 ? ` — short ${Math.round(savedShortfall * 1000) / 1000} ${material.foodItem.unit.symbol}` : ''}</span>
          ) : (
            shortfall > 0 && (
              <span className="ml-2 font-semibold text-amber-800">· short {Math.round(shortfall * 1000) / 1000} {material.foodItem.unit.symbol}</span>
            )
          )}
        </p>
      </div>

      <div className="flex flex-none flex-wrap items-center justify-end gap-2">
        {material.isDraft && (
          isAdmin ? (
            <button
              type="button"
              disabled={isBusy || isSaving || isCommitting || !canCommit}
              onClick={() => void commit()}
              title={canCommit ? 'Stock is available — add to the plan now' : `Still short — ${Math.round(savedShortfall * 1000) / 1000} ${material.foodItem.unit.symbol} to go`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCommitting ? 'Adding…' : 'Add'}
            </button>
          ) : (
            <span
              title="Only an ADMIN can add this once stock is available"
              className="inline-flex flex-none items-center gap-1.5 rounded-lg border border-border-strong/60 px-3 py-1.5 text-xs font-semibold text-muted"
            >
              <LockIcon className="h-4 w-4" />
              Admin adds once in stock
            </span>
          )
        )}
        <input
          type="number"
          min={0.001}
          step="any"
          value={quantity}
          disabled={!isEditable || isBusy || isSaving}
          onChange={(e) => setQuantity(e.target.value)}
          aria-label={`Planned quantity for ${material.foodItem.name}`}
          className="w-20 rounded-lg border border-border-strong/70 bg-white px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:bg-background disabled:text-muted"
        />
        <select
          value={unitId}
          disabled={!isEditable || isBusy || isSaving}
          onChange={(e) => setUnitId(e.target.value)}
          aria-label="Unit"
          className="rounded-lg border border-border-strong/70 bg-white px-2 py-1.5 text-xs font-semibold outline-none focus:border-primary disabled:bg-background disabled:text-muted"
        >
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>{unit.symbol}</option>
          ))}
        </select>
        {isEditable && dirty && (
          <button
            type="button"
            onClick={() => void save()}
            disabled={isSaving}
            aria-label="Save quantity"
            className="rounded-lg bg-primary p-1.5 text-primary-foreground transition hover:bg-primary-dark disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
              <path d="M5 13l4 4L19 7" />
            </svg>
          </button>
        )}
        {isEditable && (
          <button
            type="button"
            onClick={() => void remove()}
            disabled={isBusy || isSaving}
            aria-label={`Remove ${material.foodItem.name}`}
            className="rounded-lg p-1.5 text-muted transition hover:bg-red-50 hover:text-danger disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
      </div>
    </li>
  );
}

/* ---------- Add dish dropdown ---------- */

function AddDishControl({
  availableDishes,
  disabled,
  onAdd,
}: {
  availableDishes: { id: string; name: string }[];
  disabled: boolean;
  onAdd: (dishId: string) => void;
}) {
  const [value, setValue] = useState('');
  const noDishes = availableDishes.length === 0;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <UtensilsIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <select
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled || noDishes}
          aria-label="Select dish to add"
          className="appearance-none rounded-xl border border-border-strong/70 bg-white py-2 pl-9 pr-8 text-sm font-medium text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:bg-background disabled:text-muted"
        >
          <option value="">{noDishes ? 'All dishes added' : 'Select dish…'}</option>
          {availableDishes.map((dish) => (
            <option key={dish.id} value={dish.id}>{dish.name}</option>
          ))}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      </div>
      <button
        type="button"
        disabled={disabled || !value}
        onClick={() => {
          if (value) {
            onAdd(value);
            setValue('');
          }
        }}
        className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        <PlusIcon className="h-4 w-4" />
        Add Dish
      </button>
    </div>
  );
}

/* ---------- Small building blocks ---------- */

function SummaryStat({ icon, label, value, secondary }: { icon?: React.ReactNode; label: string; value: string; secondary?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
      <dt className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm font-bold text-ink" title={value}>{value}</dd>
      {secondary && <dd className="mt-0.5 text-[10px] font-semibold tabular-nums text-secondary">{secondary}</dd>}
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-2.5 last:border-0 last:pb-0">
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className={`text-right text-sm font-medium text-ink ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}

/** One numeric cell of the §39 material summary table. */
function SummaryCell({ value, strong, tone }: { value: number; strong?: boolean; tone?: string }) {
  const rounded = Math.round(value * 1000) / 1000;
  return (
    <td
      className={`px-4 py-3 text-right tabular-nums ${strong ? 'font-bold text-ink' : tone ? tone : 'text-secondary'}`}
    >
      {rounded}
    </td>
  );
}

function formatTime12h(startTime: string, endTime: string | null): string {
  if (!startTime) return '—';
  const to12h = (time: string): string => {
    const [hourRaw, minuteRaw] = time.split(':').map(Number);
    const hour = hourRaw ?? 0;
    const minute = minuteRaw ?? 0;
    const period = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
  };
  return `${to12h(startTime)}${endTime ? ` – ${to12h(endTime)}` : ''}`;
}

function formatDateLong(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(year ?? 2026, (month ?? 1) - 1, day ?? 1, 12),
  );
}

function EventDetailSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading event">
      <Skeleton className="h-4 w-40" />
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-10 w-48" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl xl:col-span-2" />
      </div>
    </div>
  );
}
