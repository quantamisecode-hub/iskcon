import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  acceptMaterialReturn,
  fetchMaterialReturn,
  rejectMaterialReturn,
  type MaterialReturn,
  type MaterialReturnStatus,
  type MaterialReturnTimelineEntry,
} from '../features/returns/api/returns.api';
import { useAuth } from '../hooks/useAuth';
import { onRealtime } from '../services/realtime/socketClient';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';
import { ArrowLeftIcon, CheckIcon, TruckIcon } from '../components/ui/icons';

/**
 * RETURN DETAIL — admin reviews (accept in full / accept partially / reject);
 * executor sees the immutable outcome. Submitting never restocks; the accept
 * call is THE only path that moves inventory back.
 */

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

const TIMELINE_ACTION_LABEL: Record<string, string> = {
  CREATED: 'Return Raised',
  SUBMITTED: 'Submitted for Review',
  ACCEPTED: 'Accepted — Stock Restocked',
  PARTIALLY_ACCEPTED: 'Partially Accepted',
  REJECTED: 'Rejected',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const REASON_LABEL: Record<string, string> = {
  EVENT_CANCELLED: 'Event cancelled',
  EXTRA_MATERIAL: 'More material issued than used',
  SPOILAGE: 'Spoilage / damage',
  QUALITY: 'Quality issue',
  OTHER: 'Other',
};

export function ReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [materialReturn, setMaterialReturn] = useState<MaterialReturn | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [showAccept, setShowAccept] = useState(false);
  const [accepted, setAccepted] = useState<Record<string, string>>({});
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const result = await fetchMaterialReturn(id);
      setMaterialReturn(result);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) setNotFound(true);
      else setError('Unable to load this return.');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live refresh: when another session creates/reviews THIS return
  // (material-return:*), reload so status, quantities and the timeline
  // update without a manual refresh.
  useEffect(() => {
    if (!id) return;
    const unsubscribe = onRealtime('onLifecycle', (ev, payload) => {
      if (!ev.startsWith('material-return:')) return;
      if ((payload as { returnId?: string })?.returnId === id) void load();
    });
    return () => { unsubscribe(); };
  }, [id, load]);

  const showNotice = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 4000);
  };

  const run = async (fn: () => Promise<MaterialReturn>, success: string) => {
    setIsBusy(true);
    setError(null);
    try {
      const updated = await fn();
      setMaterialReturn(updated);
      showNotice(success);
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? 'Action failed.');
    } finally {
      setIsBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading return">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="rounded-2xl border border-border bg-card p-12 text-center">
        <h1 className="text-2xl font-bold text-ink">Return not found</h1>
        <p className="mt-2 text-sm text-secondary">This return does not exist or you don't have access to it.</p>
        <Link to="/returns" className="mt-6 inline-block rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-dark">Back to Returns</Link>
      </div>
    );
  }

  if (error && !materialReturn) {
    return (
      <div role="alert" className="rounded-2xl border border-danger/25 bg-danger-soft p-8 text-center">
        <p className="text-base font-bold text-danger">Couldn't load the return</p>
        <p className="mt-2 text-sm text-danger/90">{error}</p>
        <button type="button" onClick={() => void load()} className="mt-5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-dark">Try Again</button>
      </div>
    );
  }

  if (!materialReturn) return null;

  const isReviewer = isAdmin && materialReturn.adminId === user?.id;
  // Only the in-scope admin can review, and only while it awaits review.
  const canReview = isReviewer && materialReturn.status === 'PENDING_ADMIN_REVIEW';

  const openAccept = () => {
    const defaults: Record<string, string> = {};
    for (const item of materialReturn.items) defaults[item.id] = String(item.requestedReturnQuantity);
    setAccepted(defaults);
    setShowAccept(true);
  };

  const submitAccept = () => {
    const items: Array<{ itemId: string; acceptedQuantity: number }> = [];
    for (const item of materialReturn.items) {
      const raw = (accepted[item.id] ?? '').trim();
      if (raw === '') continue;
      const quantity = Number(raw);
      if (!Number.isFinite(quantity) || quantity < 0) {
        setError(`Enter a valid quantity for ${item.foodItemName}.`);
        return;
      }
      if (quantity > item.requestedReturnQuantity) {
        setError(`Only ${item.requestedReturnQuantity} ${item.unitSymbol} of ${item.foodItemName} was requested for return.`);
        return;
      }
      items.push({ itemId: item.id, acceptedQuantity: quantity });
    }
    if (items.length === 0 || items.every((entry) => entry.acceptedQuantity === 0)) {
      setError('Accept at least one line. Use Reject to decline the whole return.');
      return;
    }
    setShowAccept(false);
    void run(() => acceptMaterialReturn(materialReturn.id, items), 'Return accepted — inventory restocked.');
  };

  const requestedTotal = materialReturn.items.reduce((sum, line) => sum + line.requestedReturnQuantity, 0);
  const acceptedTotal = materialReturn.items.reduce((sum, line) => sum + line.acceptedReturnQuantity, 0);
  const rejectedTotal = materialReturn.items.reduce((sum, line) => sum + line.rejectedReturnQuantity, 0);

  return (
    <div className="space-y-6">
      <Link to="/returns" className="inline-flex items-center gap-2 text-xs font-bold text-secondary transition hover:text-primary">
        <ArrowLeftIcon className="h-4 w-4" />
        Back to Returns
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{materialReturn.event.name}</h1>
          <p className="mt-1 font-mono text-xs tracking-wider text-muted">Return #{materialReturn.returnCode} · {materialReturn.event.eventCode}</p>
        </div>
        <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${STATUS_BADGE[materialReturn.status]}`}>
          {STATUS_LABEL[materialReturn.status]}
        </span>
      </div>

      {notice && <div role="status" className="rounded-xl border border-[#1e7a3c]/25 bg-[#e9f7ee] px-4 py-3 text-sm font-medium text-[#145c2c]">{notice}</div>}
      {error && <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">Return Information</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <InfoRow label="Event Date" value={new Date(materialReturn.event.eventDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} />
            <InfoRow label="Event Status" value={materialReturn.event.status} />
            <InfoRow label="Raised By" value={`${materialReturn.requester.firstName} ${materialReturn.requester.lastName}`} />
            <InfoRow label="Reviewing Admin" value={`${materialReturn.admin.firstName} ${materialReturn.admin.lastName}`} />
            <InfoRow label="Requested" value={formatStamp(materialReturn.requestedAt)} />
            {materialReturn.reviewedAt && <InfoRow label="Reviewed" value={formatStamp(materialReturn.reviewedAt)} />}
            {materialReturn.completedAt && <InfoRow label="Completed" value={formatStamp(materialReturn.completedAt)} />}
          </dl>

          <div className="mt-4 border-t border-border pt-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Reason</p>
            <p className="mt-1.5 text-sm leading-relaxed text-secondary">
              {materialReturn.reason ? (REASON_LABEL[materialReturn.reason] ?? materialReturn.reason) : '—'}
              {materialReturn.reasonNote ? ` — ${materialReturn.reasonNote}` : ''}
            </p>
          </div>

          {materialReturn.notes && (
            <div className="mt-4 border-t border-border pt-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Notes</p>
              <p className="mt-1.5 text-sm leading-relaxed text-secondary">{materialReturn.notes}</p>
            </div>
          )}

          <div className="mt-4 rounded-xl border border-border bg-background px-4 py-3 text-[11px] leading-relaxed text-secondary">
            <span className="font-semibold text-ink">Requested {requestedTotal}</span>
            {materialReturn.status !== 'PENDING_ADMIN_REVIEW' && (
              <> · <span className="font-semibold text-ink">Accepted {acceptedTotal}</span>{rejectedTotal > 0 && <> · Rejected {rejectedTotal}</>}</>
            )}
            <p className="mt-1 text-muted">Stock moved only by the accepted quantity — never by the request itself.</p>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">Returned Materials</h2>
            {materialReturn.status === 'PENDING_ADMIN_REVIEW' && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                <TruckIcon className="h-3 w-3" />
                Awaiting Review
              </span>
            )}
          </div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background text-left text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">
                  <th className="px-4 py-3">Material</th>
                  <th className="px-4 py-3 text-right">Issued</th>
                  <th className="px-4 py-3 text-right">Returned Before</th>
                  <th className="px-4 py-3 text-right">Returnable at Submit</th>
                  <th className="px-4 py-3 text-right">Requested</th>
                  <th className="px-4 py-3 text-right">Accepted</th>
                  <th className="px-4 py-3 text-right">Rejected</th>
                </tr>
              </thead>
              <tbody>
                {materialReturn.items.map((item) => (
                  <tr key={item.id} className="border-b border-border/60 last:border-0 hover:bg-background/60">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink">{item.foodItemName}</p>
                      <p className="text-[11px] text-muted">{item.unitSymbol}</p>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-secondary">{item.issuedQuantity} {item.unitSymbol}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-secondary">{item.previouslyReturnedQuantity} {item.unitSymbol}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-secondary">{item.returnableAtSubmit} {item.unitSymbol}</td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-ink">{item.requestedReturnQuantity} {item.unitSymbol}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-emerald-700">{item.acceptedReturnQuantity > 0 ? `${item.acceptedReturnQuantity} ${item.unitSymbol}` : '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-secondary">{item.rejectedReturnQuantity > 0 ? `${item.rejectedReturnQuantity} ${item.unitSymbol}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            Only material that was actually issued can be returned. <strong className="text-ink">Inventory increases only when you accept</strong> — and never beyond what is still returnable.
          </p>

          {canReview && (
            <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border pt-5">
              <button type="button" disabled={isBusy} onClick={() => setShowReject(true)} className="rounded-xl border border-danger/40 px-5 py-2.5 text-sm font-semibold text-danger transition hover:bg-danger-soft disabled:opacity-60">Reject</button>
              <button type="button" disabled={isBusy} onClick={openAccept} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-dark disabled:opacity-60">
                Accept Return
              </button>
              <span className="text-[11px] text-muted">Full accept by default — edit quantities for a partial accept (0 rejects that line).</span>
            </div>
          )}
        </section>
      </div>

      {/* Immutable timeline */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">Return Timeline</h2>
        <Timeline entries={materialReturn.timeline ?? []} />
      </section>

      {showAccept && (
        <AcceptModal
          items={materialReturn.items}
          accepted={accepted}
          onChange={(itemId, value) => setAccepted((prev) => ({ ...prev, [itemId]: value }))}
          isBusy={isBusy}
          onCancel={() => setShowAccept(false)}
          onConfirm={submitAccept}
        />
      )}

      {showReject && (
        <Modal title="Reject Return" onClose={() => setShowReject(false)} maxWidthClass="max-w-md">
          <div className="space-y-3">
            <label htmlFor="reject-reason" className="block text-xs font-semibold text-ink">Reason *</label>
            <textarea id="reject-reason" rows={4} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="e.g. Material was already consumed at the event" className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary" />
            {rejectReason.trim() === '' && <p className="text-[11px] text-muted">A reason is required so the requester knows what happened. No stock moves on rejection.</p>}
            <div className="flex items-center justify-end gap-3 pt-1">
              <button type="button" onClick={() => setShowReject(false)} className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-background">Cancel</button>
              <button type="button" disabled={isBusy || rejectReason.trim() === ''} onClick={() => { const r = rejectReason.trim(); setShowReject(false); setRejectReason(''); void run(() => rejectMaterialReturn(materialReturn.id, r), 'Return rejected. No stock was moved.'); }} className="rounded-xl bg-danger px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50">Reject Return</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function formatStamp(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-2.5 last:border-0 last:pb-0">
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="text-right text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}

function AcceptModal({
  items,
  accepted,
  onChange,
  isBusy,
  onCancel,
  onConfirm,
}: {
  items: MaterialReturn['items'];
  accepted: Record<string, string>;
  onChange: (itemId: string, value: string) => void;
  isBusy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const lines = items.map((item) => {
    const raw = (accepted[item.id] ?? '').trim();
    const quantity = raw === '' ? 0 : Number(raw);
    const valid = Number.isFinite(quantity) && quantity >= 0 && quantity <= item.requestedReturnQuantity;
    return { item, quantity: valid ? quantity : 0, valid };
  });
  const anyPositive = lines.some((line) => line.valid && line.quantity > 0);
  const allValid = lines.every((line) => line.valid) && anyPositive;

  return (
    <Modal title="Accept Return" onClose={onCancel} maxWidthClass="max-w-2xl">
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-secondary">
          This action <strong className="text-ink">restocks the accepted quantities into inventory</strong> and records a RETURN transaction.
          Lines set to <strong className="text-ink">0 are rejected</strong>; leave every line untouched to accept in full.
        </p>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-background text-left text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">
                <th className="px-3 py-2.5">Material</th>
                <th className="px-3 py-2.5 text-right">Requested</th>
                <th className="px-3 py-2.5 text-right">Returnable</th>
                <th className="px-3 py-2.5 text-right">Accept Now</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(({ item }) => (
                <tr key={item.id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-ink">{item.foodItemName}</p>
                    <p className="text-[11px] text-muted">{item.unitSymbol}</p>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-secondary">{item.requestedReturnQuantity}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-secondary">{item.returnableAtSubmit}</td>
                  <td className="px-3 py-2.5 text-right">
                    <input
                      type="number"
                      min={0}
                      max={item.requestedReturnQuantity}
                      step={1}
                      value={accepted[item.id] ?? ''}
                      onChange={(e) => onChange(item.id, e.target.value)}
                      aria-label={`Accepted quantity for ${item.foodItemName}`}
                      className="w-24 rounded-lg border border-border-strong/70 bg-white px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:border-primary"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="rounded-xl border border-border bg-background px-4 py-3 text-[11px] leading-relaxed text-secondary">
          The server recomputes the live returnable under locks and refuses any over-return, so you can never accept more than what is still eligible.
        </p>
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-background">Cancel</button>
          <button type="button" disabled={isBusy || !allValid} onClick={onConfirm} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60">
            <CheckIcon className="h-4 w-4" />
            {isBusy ? 'Accepting…' : 'Confirm Accept'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Timeline({ entries }: { entries: MaterialReturnTimelineEntry[] }) {
  if (entries.length === 0) {
    return <p className="mt-4 text-sm text-muted">No timeline entries recorded yet.</p>;
  }
  return (
    <ol className="mt-5 space-y-0">
      {entries.map((entry, idx) => {
        const done = idx < entries.length - 1;
        const isFinal = idx === entries.length - 1 && ['ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED', 'COMPLETED', 'CANCELLED'].includes(entry.toStatus ?? '');
        return (
          <li key={entry.id} className="relative flex gap-4 pb-6 last:pb-0">
            {idx < entries.length - 1 && (
              <span aria-hidden="true" className="absolute left-[9px] top-5 h-full w-px bg-border" />
            )}
            <span
              aria-hidden="true"
              className={`relative z-10 mt-1 flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full border ${
                isFinal
                  ? 'border-emerald-400 bg-emerald-100 text-emerald-700'
                  : done
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted'
              }`}
            >
              {isFinal ? <CheckIcon className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-bold text-ink">{TIMELINE_ACTION_LABEL[entry.action] ?? entry.action}</p>
                <p className="text-[11px] tabular-nums text-muted">{formatStamp(entry.createdAt)}</p>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-secondary">{entry.message}</p>
              {entry.actorName && (
                <p className="mt-0.5 text-[11px] text-muted">{entry.actorName}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
