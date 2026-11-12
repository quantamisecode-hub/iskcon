import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  approveMaterialRequest,
  cancelMaterialRequest,
  fetchMaterialRequest,
  issueMaterialRequest,
  rejectMaterialRequest,
  submitMaterialRequest,
  type MaterialRequest,
  type MaterialRequestStatus,
  type RequestItemView,
  type RequestTimelineEntry,
} from '../features/requests/api/requests.api';
import { useAuth } from '../hooks/useAuth';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';
import { ArrowLeftIcon, CheckIcon, PackageIcon } from '../components/ui/icons';

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
  APPROVED: 'Approved — Awaiting Issue',
  PARTIALLY_ISSUED: 'Partially Issued',
  ISSUED: 'Issued',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  CANCELLED_BY_EVENT: 'Cancelled with Event',
};

const ITEM_STATUS_BADGE: Record<string, string> = {
  REQUESTED: 'border-slate-300 bg-slate-100 text-slate-800',
  APPROVED: 'border-emerald-300 bg-emerald-100 text-emerald-900',
  PARTIALLY_ISSUED: 'border-sky-300 bg-sky-100 text-sky-900',
  ISSUED: 'border-teal-400 bg-teal-100 text-teal-900',
  REJECTED: 'border-red-300 bg-red-100 text-red-900',
  CANCELLED: 'border-slate-300 bg-slate-100 text-slate-600',
  CANCELLED_BY_EVENT: 'border-slate-300 bg-slate-100 text-slate-600',
};

const ITEM_STATUS_LABEL: Record<string, string> = {
  REQUESTED: 'Requested',
  APPROVED: 'Approved',
  PARTIALLY_ISSUED: 'Partially Issued',
  ISSUED: 'Issued',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  CANCELLED_BY_EVENT: 'Cancelled with Event',
};

const TIMELINE_ACTION_LABEL: Record<string, string> = {
  CREATED: 'Request Created',
  SUBMITTED: 'Submitted for Approval',
  APPROVED: 'Approved',
  PARTIALLY_APPROVED: 'Partially Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  CANCELLED_BY_EVENT: 'Cancelled with Event',
  ISSUE_STARTED: 'Stock Issue Started',
  PARTIALLY_ISSUED: 'Stock Partially Issued',
  ISSUED: 'Stock Fully Issued',
};

export function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [request, setRequest] = useState<MaterialRequest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const [showIssue, setShowIssue] = useState(false);
  const [issueQuantities, setIssueQuantities] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const result = await fetchMaterialRequest(id);
      setRequest(result);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) setNotFound(true);
      else setError('Unable to load this request.');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const showNotice = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 4000);
  };

  const run = async (fn: () => Promise<MaterialRequest>, success: string) => {
    setIsBusy(true);
    setError(null);
    try {
      const updated = await fn();
      setRequest(updated);
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
      <div className="space-y-6" role="status" aria-label="Loading request">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="rounded-2xl border border-border bg-card p-12 text-center">
        <h1 className="text-2xl font-bold text-ink">Request not found</h1>
        <p className="mt-2 text-sm text-secondary">This request does not exist or you don't have access to it.</p>
        <Link to="/requests" className="mt-6 inline-block rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-dark">Back to Requests</Link>
      </div>
    );
  }

  if (error || !request) {
    return (
      <div role="alert" className="rounded-2xl border border-danger/25 bg-danger-soft p-8 text-center">
        <p className="text-base font-bold text-danger">Couldn't load the request</p>
        <p className="mt-2 text-sm text-danger/90">{error}</p>
        <button type="button" onClick={() => void load()} className="mt-5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-dark">Try Again</button>
      </div>
    );
  }

  const isRequester = request.requestedById === user?.id;
  // Only an Executor raises requests; an Admin only reviews, decides and issues.
  const canSubmit = !isAdmin && request.status === 'DRAFT' && isRequester;
  const canCancel = (request.status === 'DRAFT' || request.status === 'PENDING_APPROVAL') && (isRequester || (isAdmin && request.adminId === user?.id && request.status === 'PENDING_APPROVAL'));
  // Separation of duties: an admin can never approve/reject their own request.
  const canAct = isAdmin && request.status === 'PENDING_APPROVAL' && request.adminId === user?.id && !isRequester;
  // Stock issue: ADMIN only, in scope, on approved / partially issued requests.
  const canIssue =
    isAdmin &&
    request.adminId === user?.id &&
    !isRequester &&
    (request.status === 'APPROVED' || request.status === 'PARTIALLY_ISSUED') &&
    request.items.some((item) => item.pendingQuantity > 0);

  const issuableItems = request.items.filter((item) => item.pendingQuantity > 0 && item.itemStatus !== 'REJECTED' && item.itemStatus !== 'CANCELLED');

  const openIssue = () => {
    const defaults: Record<string, string> = {};
    for (const item of issuableItems) defaults[item.id] = String(item.pendingQuantity);
    setIssueQuantities(defaults);
    setShowIssue(true);
  };

  const submitIssue = () => {
    const items: Array<{ itemId: string; quantity: number }> = [];
    for (const item of issuableItems) {
      const raw = (issueQuantities[item.id] ?? '').trim();
      if (raw === '') continue;
      const quantity = Number(raw);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        setError(`Enter a positive whole number for ${item.foodItemName}.`);
        return;
      }
      if (quantity > item.pendingQuantity) {
        setError(`Only ${item.pendingQuantity} ${item.unitSymbol} remains approved for ${item.foodItemName}.`);
        return;
      }
      if (quantity > (item.availableStock ?? 0)) {
        setError(`Only ${item.availableStock ?? 0} ${item.unitSymbol} of ${item.foodItemName} is in stock.`);
        return;
      }
      items.push({ itemId: item.id, quantity });
    }
    if (items.length === 0) {
      setError('Enter an issue quantity for at least one item.');
      return;
    }
    setShowIssue(false);
    void run(() => issueMaterialRequest(request.id, items), 'Stock issued successfully.');
  };

  return (
    <div className="space-y-6">
      <Link to="/requests" className="inline-flex items-center gap-2 text-xs font-bold text-secondary transition hover:text-primary">
        <ArrowLeftIcon className="h-4 w-4" />
        Back to Requests
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{request.event.name}</h1>
          <p className="mt-1 font-mono text-xs tracking-wider text-muted">Request #{request.requestCode} · {request.event.eventCode}</p>
        </div>
        <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${STATUS_BADGE[request.status]}`}>
          {STATUS_LABEL[request.status]}
        </span>
      </div>

      {notice && <div role="status" className="rounded-xl border border-[#1e7a3c]/25 bg-[#e9f7ee] px-4 py-3 text-sm font-medium text-[#145c2c]">{notice}</div>}
      {error && <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">Event Information</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <InfoRow
              label="Event Date"
              value={new Date(request.event.eventDate).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            />
            <InfoRow label="People" value={String(request.event.numberOfPeople ?? '—')} />
            <InfoRow label="Requested By" value={`${request.requestedBy.firstName} ${request.requestedBy.lastName}`} />
            <InfoRow label="Assigned Admin" value={`${request.admin.firstName} ${request.admin.lastName}`} />
            <InfoRow label="Created" value={formatStamp(request.createdAt)} />
            {request.submittedAt && <InfoRow label="Submitted" value={formatStamp(request.submittedAt)} />}
            {request.approvedAt && <InfoRow label="Approved At" value={formatStamp(request.approvedAt)} />}
            {request.issuedAt && <InfoRow label="Fully Issued At" value={formatStamp(request.issuedAt)} />}
            {request.rejectedAt && <InfoRow label="Rejected At" value={formatStamp(request.rejectedAt)} />}
          </dl>
          {request.notes && (
            <div className="mt-4 border-t border-border pt-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Notes</p>
              <p className="mt-1.5 text-sm leading-relaxed text-secondary">{request.notes}</p>
            </div>
          )}
          {request.rejectionReason && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-800">Rejection Reason</p>
              <p className="mt-1 text-sm leading-relaxed text-red-900">{request.rejectionReason}</p>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">Requested Materials</h2>
            {request.status === 'APPROVED' && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                <PackageIcon className="h-3 w-3" />
                Awaiting Issue
              </span>
            )}
          </div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background text-left text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">
                  <th className="px-4 py-3">Material</th>
                  <th className="px-4 py-3 text-right">Requested</th>
                  <th className="px-4 py-3 text-right">Approved</th>
                  <th className="px-4 py-3 text-right">Issued</th>
                  <th className="px-4 py-3 text-right">Remaining</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {request.items.map((item) => (
                  <tr key={item.id} className="border-b border-border/60 last:border-0 hover:bg-background/60">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink">{item.foodItemName}</p>
                      <p className="text-[11px] text-muted">{item.dishName ? `${item.dishName} · ` : ''}{item.categoryName ?? ''} · {item.unitSymbol}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-ink">{item.requestedQuantity} {item.unitSymbol}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-secondary">{item.approvedQuantity} {item.unitSymbol}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-ink">{item.issuedQuantity} {item.unitSymbol}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-secondary">{item.pendingQuantity} {item.unitSymbol}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${ITEM_STATUS_BADGE[item.itemStatus] ?? ITEM_STATUS_BADGE.REQUESTED}`}>
                        {ITEM_STATUS_LABEL[item.itemStatus] ?? item.itemStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            Approval authorises these quantities. <strong className="text-ink">Inventory is only deducted when stock is actually issued</strong> — issuing is the moment stock leaves the store.
          </p>

          {(canSubmit || canAct || canIssue || canCancel) && (
            <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border pt-5">
              {canSubmit && (
                <button type="button" disabled={isBusy} onClick={() => void run(() => submitMaterialRequest(request.id), 'Request submitted for approval.')} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-dark disabled:opacity-60">
                  {isBusy ? 'Submitting…' : 'Submit for Approval'}
                </button>
              )}
              {canAct && (
                <>
                  <button type="button" disabled={isBusy} onClick={() => setShowReject(true)} className="rounded-xl border border-danger/40 px-5 py-2.5 text-sm font-semibold text-danger transition hover:bg-danger-soft disabled:opacity-60">Reject</button>
                  <button type="button" disabled={isBusy} onClick={() => setShowApprove(true)} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-dark disabled:opacity-60">Approve</button>
                </>
              )}
              {canIssue && (
                <button type="button" disabled={isBusy} onClick={openIssue} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-dark disabled:opacity-60">
                  Issue Stock
                </button>
              )}
              {canCancel && (
                <button type="button" disabled={isBusy} onClick={() => setShowCancel(true)} className="rounded-xl border border-border-strong/60 px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-background disabled:opacity-60">Cancel Request</button>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Immutable timeline */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">Request Timeline</h2>
        <Timeline request={request} />
      </section>

      {showApprove && (
        <Modal title="Approve Request?" onClose={() => setShowApprove(false)} maxWidthClass="max-w-md">
          <p className="text-sm leading-relaxed text-secondary">
            This will mark <strong className="text-ink">{request.requestCode}</strong> as approved and authorise the requested quantities.
            <span className="font-semibold text-ink"> Inventory will NOT be deducted at this stage</span> — deduction happens only when you issue stock.
          </p>
          <div className="mt-5 flex items-center justify-end gap-3">
            <button type="button" onClick={() => setShowApprove(false)} className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-background">Cancel</button>
            <button type="button" disabled={isBusy} onClick={() => { setShowApprove(false); void run(() => approveMaterialRequest(request.id), 'Request approved.'); }} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-dark disabled:opacity-60">{isBusy ? 'Approving…' : 'Approve'}</button>
          </div>
        </Modal>
      )}

      {showReject && (
        <Modal title="Reject Request" onClose={() => setShowReject(false)} maxWidthClass="max-w-md">
          <div className="space-y-3">
            <label htmlFor="reject-reason" className="block text-xs font-semibold text-ink">Reason *</label>
            <textarea id="reject-reason" rows={4} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="e.g. Insufficient stock available" className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary" />
            {rejectReason.trim() === '' && <p className="text-[11px] text-muted">A reason is required so the requester knows what to fix.</p>}
            <div className="flex items-center justify-end gap-3 pt-1">
              <button type="button" onClick={() => setShowReject(false)} className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-background">Cancel</button>
              <button type="button" disabled={isBusy || rejectReason.trim() === ''} onClick={() => { const r = rejectReason.trim(); setShowReject(false); setRejectReason(''); void run(() => rejectMaterialRequest(request.id, r), 'Request rejected.'); }} className="rounded-xl bg-danger px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50">Reject Request</button>
            </div>
          </div>
        </Modal>
      )}

      {showIssue && (
        <IssueModal
          items={issuableItems}
          quantities={issueQuantities}
          onChange={(itemId, value) => setIssueQuantities((prev) => ({ ...prev, [itemId]: value }))}
          isBusy={isBusy}
          onCancel={() => setShowIssue(false)}
          onConfirm={submitIssue}
        />
      )}

      {showCancel && (
        <Modal title="Cancel Request?" onClose={() => setShowCancel(false)} maxWidthClass="max-w-md">
          <p className="text-sm leading-relaxed text-secondary">This request will no longer be processed.</p>
          <div className="mt-5 flex items-center justify-end gap-3">
            <button type="button" onClick={() => setShowCancel(false)} className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-background">Keep Request</button>
            <button type="button" disabled={isBusy} onClick={() => { setShowCancel(false); void run(() => cancelMaterialRequest(request.id), 'Request cancelled.'); }} className="rounded-xl bg-danger px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60">Cancel Request</button>
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

function IssueModal({
  items,
  quantities,
  onChange,
  isBusy,
  onCancel,
  onConfirm,
}: {
  items: RequestItemView[];
  quantities: Record<string, string>;
  onChange: (itemId: string, value: string) => void;
  isBusy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const lines = items.map((item) => {
    const raw = (quantities[item.id] ?? '').trim();
    const quantity = raw === '' ? 0 : Number(raw);
    const valid = Number.isInteger(quantity) && quantity > 0 && quantity <= item.pendingQuantity && quantity <= (item.availableStock ?? 0);
    const after = (item.availableStock ?? 0) - (valid ? quantity : 0);
    return { item, quantity, valid, after };
  });
  const allValid = lines.every((line) => line.valid);

  return (
    <Modal title="Confirm Stock Issue" onClose={onCancel} maxWidthClass="max-w-2xl">
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-secondary">
          This action <strong className="text-ink">deducts the issued quantities from inventory</strong> and records a stock-out transaction.
        </p>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-background text-left text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">
                <th className="px-3 py-2.5">Item</th>
                <th className="px-3 py-2.5 text-right">Approved</th>
                <th className="px-3 py-2.5 text-right">Issued</th>
                <th className="px-3 py-2.5 text-right">Remaining</th>
                <th className="px-3 py-2.5 text-right">In Stock</th>
                <th className="px-3 py-2.5 text-right">Issue Now</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(({ item }) => (
                <tr key={item.id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-ink">{item.foodItemName}</p>
                    <p className="text-[11px] text-muted">{item.unitSymbol}</p>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-secondary">{item.approvedQuantity}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-secondary">{item.issuedQuantity}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-ink">{item.pendingQuantity}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-secondary">{item.availableStock ?? 0}</td>
                  <td className="px-3 py-2.5 text-right">
                    <input
                      type="number"
                      min={0}
                      max={item.pendingQuantity}
                      step={1}
                      value={quantities[item.id] ?? ''}
                      onChange={(e) => onChange(item.id, e.target.value)}
                      aria-label={`Issue quantity for ${item.foodItemName}`}
                      className="w-24 rounded-lg border border-border-strong/70 bg-white px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:border-primary"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-xl border border-border bg-background px-4 py-3 text-[11px] leading-relaxed text-secondary">
          {lines.map(({ item, quantity, valid, after }) => (
            <p key={item.id}>
              <span className="font-semibold text-ink">{item.foodItemName}</span> — issue {valid ? quantity : 0} {item.unitSymbol} · current stock {item.availableStock ?? 0} → <span className="font-semibold tabular-nums text-ink">{after} {item.unitSymbol}</span>
            </p>
          ))}
          <p className="mt-2 text-muted">The server re-reads stock inside the transaction and will refuse any oversell.</p>
        </div>
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-background">Cancel</button>
          <button type="button" disabled={isBusy || !allValid} onClick={onConfirm} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60">
            <CheckIcon className="h-4 w-4" />
            {isBusy ? 'Issuing…' : 'Confirm Issue'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Timeline({ request }: { request: MaterialRequest }) {
  const entries = request.timeline?.length
    ? request.timeline
    : deriveLegacyTimeline(request);

  return (
    <ol className="mt-5 space-y-0">
      {entries.map((entry, idx) => {
        const done = idx < entries.length - 1;
        const isFinal = idx === entries.length - 1 && ['ISSUED', 'REJECTED', 'CANCELLED'].includes(entry.toStatus ?? '');
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

/** Older requests predate the timeline table — derive a display-only journey. */
function deriveLegacyTimeline(request: MaterialRequest): RequestTimelineEntry[] {
  const rows: RequestTimelineEntry[] = [];
  const push = (action: string, toStatus: string, message: string, createdAt: string | null | undefined, actorName: string | null) => {
    if (!createdAt) return;
    rows.push({
      id: `${action}-${createdAt}`,
      action,
      fromStatus: null,
      toStatus,
      message,
      actorId: null,
      actorName,
      createdAt,
    });
  };
  push('CREATED', 'DRAFT', `Request ${request.requestCode} created for ${request.event.name}.`, request.createdAt, `${request.requestedBy.firstName} ${request.requestedBy.lastName}`);
  push('SUBMITTED', 'PENDING_APPROVAL', 'Request submitted for Admin approval.', request.submittedAt, `${request.requestedBy.firstName} ${request.requestedBy.lastName}`);
  if (request.status === 'REJECTED') {
    push('REJECTED', 'REJECTED', `Request rejected. Reason: ${request.rejectionReason ?? '—'}`, request.rejectedAt, `${request.admin.firstName} ${request.admin.lastName}`);
  } else if (request.status === 'CANCELLED') {
    push('CANCELLED', 'CANCELLED', 'Request cancelled.', request.updatedAt, null);
  } else {
    push('APPROVED', 'APPROVED', 'Request approved. No stock has been deducted.', request.approvedAt, `${request.admin.firstName} ${request.admin.lastName}`);
    const issuedItems = request.items.filter((item) => item.issuedQuantity > 0);
    if (issuedItems.length > 0) {
      const summary = issuedItems.map((item) => `${item.issuedQuantity} ${item.unitSymbol} ${item.foodItemName}`).join(', ');
      push(
        request.status === 'ISSUED' ? 'ISSUED' : 'PARTIALLY_ISSUED',
        request.status,
        request.status === 'ISSUED'
          ? `All approved quantities issued. ${summary} issued from stock.`
          : `Partially issued: ${summary}. Remaining quantities are still pending.`,
        request.issuedAt ?? request.updatedAt,
        `${request.admin.firstName} ${request.admin.lastName}`,
      );
    }
  }
  return rows;
}
