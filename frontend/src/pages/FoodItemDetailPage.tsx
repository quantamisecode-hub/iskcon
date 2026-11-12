import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchFoodItemDetail, stockIn, stockOut, type FoodItemDetail } from '../features/inventory/api/inventory.api';
import { Skeleton } from '../components/ui/Skeleton';
import { Modal } from '../components/ui/Modal';
import { ArrowLeftIcon, TruckIcon } from '../components/ui/icons';

export function FoodItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<FoodItemDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stockMode, setStockMode] = useState<'in' | 'out' | null>(null);
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const d = await fetchFoodItemDetail(id);
      setDetail(d);
    } catch {
      setError('Unable to load this food item.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (isLoading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading item">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div role="alert" className="rounded-2xl border border-danger/25 bg-danger-soft p-8 text-center">
        <p className="text-base font-bold text-danger">Couldn't load this food item</p>
        <p className="mt-2 text-sm text-danger/90">{error ?? 'It may not exist or you don\'t have access.'}</p>
        <Link to="/inventory/food-items" className="mt-5 inline-block rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-dark">Back to Food Items</Link>
      </div>
    );
  }

  const { foodItem, currentQuantity, status, recentTransactions, relatedEvents, relatedRequests } = detail;

  const handleStock = async () => {
    setActionError(null);
    const q = Number.parseInt(qty, 10);
    if (!Number.isInteger(q) || q <= 0) { setActionError('Quantity must be a positive whole number.'); return; }
    if (stockMode === 'out') {
      if (q > currentQuantity) { setActionError(`Not enough stock — only ${currentQuantity} available.`); return; }
      if (!reason.trim()) { setActionError('A reason is required for Stock Out.'); return; }
    }
    setBusy(true);
    try {
      if (stockMode === 'in') {
        await stockIn(foodItem.id, q);
        setNotice(`Stock In recorded for ${foodItem.name} (+${q} ${foodItem.unit?.symbol ?? ''}).`);
      } else {
        await stockOut(foodItem.id, q, { reason: reason.trim() });
        setNotice(`Stock Out recorded for ${foodItem.name} (−${q} ${foodItem.unit?.symbol ?? ''}).`);
      }
      setStockMode(null);
      setQty('');
      setReason('');
      await load();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setActionError(msg ?? 'Could not record stock movement.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link to="/inventory/food-items" className="inline-flex items-center gap-2 text-xs font-bold text-secondary transition hover:text-primary">
        <ArrowLeftIcon className="h-4 w-4" />
        Back to Food Items
      </Link>

      {notice && <div role="status" className="rounded-xl border border-[#1e7a3c]/25 bg-[#e9f7ee] px-4 py-3 text-sm font-medium text-[#145c2c]">{notice}</div>}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{foodItem.name}</h1>
          <p className="mt-1 text-sm text-secondary">{foodItem.category?.name} · {foodItem.unit?.symbol} ({foodItem.unit?.name})</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${foodItem.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>
            {foodItem.isActive ? 'Active' : 'Inactive'}
          </span>
          <button type="button" onClick={() => { setStockMode('in'); setQty(''); setReason(''); setActionError(null); }} className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-primary-foreground transition hover:bg-primary-dark">+ Stock In</button>
          {currentQuantity > 0 && (
            <button type="button" onClick={() => { setStockMode('out'); setQty(''); setReason(''); setActionError(null); }} className="inline-flex items-center gap-1.5 rounded-xl border border-danger/40 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-danger transition hover:bg-danger-soft"><TruckIcon className="h-4 w-4" />− Stock Out</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryStat label="Current Stock" value={`${currentQuantity} ${foodItem.unit?.symbol ?? ''}`} tone="text-ink" />
        <SummaryStat label="Minimum Stock" value={`${foodItem.minimumStock} ${foodItem.unit?.symbol ?? ''}`} tone="text-secondary" />
        <SummaryStat label="Reorder Level" value={`${foodItem.reorderLevel} ${foodItem.unit?.symbol ?? ''}`} tone="text-secondary" />
        <SummaryStat label="Stock Status" value={statusLabel(status)} tone={status === 'NORMAL' ? 'text-emerald-700' : status === 'LOW' ? 'text-amber-700' : 'text-red-800'} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm xl:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">Recent Transactions</h2>
            <Link to="/inventory/ledger" className="text-xs font-bold text-primary hover:underline">View Full Ledger →</Link>
          </div>
          {recentTransactions.length === 0 ? (
            <p className="mt-4 text-sm text-secondary">No transactions yet for this item.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border/70">
              {recentTransactions.map((tx) => {
                const isIn = tx.transactionType === 'STOCK_IN' || tx.transactionType === 'RETURN';
                const isOut = tx.transactionType === 'STOCK_OUT';
                return (
                  <li key={tx.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{tx.transactionType.replace('_', ' ')}</p>
                      <p className="text-[11px] text-muted">
                        {new Date(tx.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        {tx.remarks ? ` · ${tx.remarks}` : ''}
                      </p>
                    </div>
                    <span className={`flex-none font-bold tabular-nums ${isIn ? 'text-emerald-700' : isOut ? 'text-red-700' : 'text-secondary'}`}>
                      {isIn ? '+' : isOut ? '−' : '±'}{Math.abs(tx.quantity)} {foodItem.unit?.symbol}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="space-y-4">
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">Related Events</h2>
            {relatedEvents.length === 0 ? (
              <p className="mt-3 text-sm text-secondary">This item has not been planned in any event yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {relatedEvents.map((ev) => (
                  <li key={ev.eventId}>
                    <Link to={`/events/${ev.eventId}`} className="block rounded-xl border border-border/60 px-3 py-2 transition hover:border-primary">
                      <p className="text-sm font-semibold text-ink">{ev.eventName}</p>
                      <p className="text-[11px] text-muted">{ev.eventCode} · {ev.eventDate} · {ev.plannedQuantity} planned</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">Related Requests</h2>
            {relatedRequests.length === 0 ? (
              <p className="mt-3 text-sm text-secondary">No material requests include this item yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {relatedRequests.map((r) => (
                  <li key={r.requestId}>
                    <Link to={`/requests/${r.requestId}`} className="block rounded-xl border border-border/60 px-3 py-2 transition hover:border-primary">
                      <p className="font-mono text-xs font-bold text-ink">{r.requestCode}</p>
                      <p className="text-[11px] text-muted">{r.status} · {r.quantity} requested</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {stockMode && (
        <Modal title={stockMode === 'in' ? 'Stock In' : 'Stock Out'} onClose={() => setStockMode(null)} maxWidthClass="max-w-md">
          <div className="space-y-4">
            <p className="text-sm text-secondary">{foodItem.name} — current stock <strong className="text-ink">{currentQuantity} {foodItem.unit?.symbol}</strong></p>
            <div>
              <label htmlFor="detail-qty" className="mb-1.5 block text-xs font-semibold text-ink">Quantity *</label>
              <input id="detail-qty" type="number" min={1} step={1} value={qty} onChange={(e) => setQty(e.target.value)} autoFocus placeholder="e.g. 50" className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />
            </div>
            {stockMode === 'out' && (
              <div>
                <label htmlFor="detail-reason" className="mb-1.5 block text-xs font-semibold text-ink">Reason *</label>
                <input id="detail-reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Issued to event, Used in kitchen, Damaged" className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />
              </div>
            )}
            {actionError && <p role="alert" className="text-xs font-semibold text-danger">{actionError}</p>}
            <div className="flex items-center justify-end gap-3">
              <button type="button" onClick={() => setStockMode(null)} className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-background">Cancel</button>
              <button type="button" disabled={busy} onClick={() => void handleStock()} className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-70 ${stockMode === 'in' ? 'bg-primary hover:bg-primary-dark' : 'bg-danger hover:bg-red-800'}`}>
                {busy ? 'Recording…' : stockMode === 'in' ? 'Record Stock In' : 'Record Stock Out'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case 'OUT_OF_STOCK': return 'Out of Stock';
    case 'CRITICAL': return 'Critical';
    case 'LOW': return 'Low Stock';
    case 'NORMAL': return 'Healthy';
    default: return status;
  }
}

function SummaryStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
      <p className={`truncate text-lg font-bold ${tone}`} title={value}>{value}</p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{label}</p>
    </div>
  );
}
