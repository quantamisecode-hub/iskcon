import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchFoodItemDetail, fetchInventoryValuation, fetchStockLots, formatINR, type FoodItemDetail, type FoodItemRow, type StockLotRow } from '../features/inventory/api/inventory.api';
import { Skeleton } from '../components/ui/Skeleton';
import { ArrowLeftIcon, PencilIcon, TruckIcon } from '../components/ui/icons';
import { useAuth } from '../hooks/useAuth';
import { APP_CONSTANTS } from '../constants/appConstants';
import { useStockModals } from '../features/inventory/context/StockModalContext';
import { EditStockLotModal } from '../features/inventory/components/EditStockLotModal';

const LOT_STATUS_STYLE: Record<StockLotRow['status'], string> = {
  AVAILABLE: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  PARTIALLY_CONSUMED: 'border-amber-200 bg-amber-50 text-amber-800',
  CONSUMED: 'border-slate-200 bg-slate-100 text-slate-600',
  CANCELLED: 'border-red-200 bg-red-50 text-red-700',
};

const LOT_STATUS_LABEL: Record<StockLotRow['status'], string> = {
  AVAILABLE: 'Available',
  PARTIALLY_CONSUMED: 'Partially Consumed',
  CONSUMED: 'Consumed',
  CANCELLED: 'Cancelled',
};

export function FoodItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const { openStockIn, openStockOut } = useStockModals();

  const [detail, setDetail] = useState<FoodItemDetail | null>(null);
  const [lots, setLots] = useState<StockLotRow[]>([]);
  const [lotValue, setLotValue] = useState<number | null>(null);
  const [editingLot, setEditingLot] = useState<StockLotRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const d = await fetchFoodItemDetail(id);
      setDetail(d);
      if (isAdmin) {
        fetchStockLots({ foodItemId: id, pageSize: 100 })
          .then((page) => {
            // Oldest-first is the natural FIFO reading order.
            setLots([...page.lots].sort((a, b) => a.receivedDate.localeCompare(b.receivedDate)));
          })
          .catch(() => setLots([]));
        fetchInventoryValuation()
          .then((valuation) => setLotValue(valuation.byItem.find((entry) => entry.foodItemId === id)?.value ?? 0))
          .catch(() => setLotValue(null));
      }
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

  useEffect(() => {
    const onRefresh = () => { void load(); };
    window.addEventListener('inventory-refresh', onRefresh);
    return () => window.removeEventListener('inventory-refresh', onRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isAdmin]);

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
  const itemForModal: FoodItemRow = {
    ...foodItem,
    inventory: {
      currentQuantity,
      updatedAt: detail.inventory?.updatedAt ? String(detail.inventory.updatedAt) : undefined,
    },
  };

  return (
    <div className="space-y-6">
      <Link to="/inventory/food-items" className="inline-flex items-center gap-2 text-xs font-bold text-secondary transition hover:text-primary">
        <ArrowLeftIcon className="h-4 w-4" />
        Back to Food Items
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{foodItem.name}</h1>
          <p className="mt-1 text-sm text-secondary">{foodItem.category?.name} · {foodItem.unit?.symbol} ({foodItem.unit?.name})</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${foodItem.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>
            {foodItem.isActive ? 'Active' : 'Inactive'}
          </span>
          <button type="button" onClick={() => openStockIn(itemForModal, () => void load())} className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-primary-foreground transition hover:bg-primary-dark">+ Stock In</button>
          {currentQuantity > 0 && (
            <button type="button" onClick={() => openStockOut(itemForModal, () => void load())} className="inline-flex items-center gap-1.5 rounded-xl border border-danger/40 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-danger transition hover:bg-danger-soft"><TruckIcon className="h-4 w-4" />− Stock Out</button>
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

      {isAdmin && (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">Stock Lots</h2>
              <p className="mt-1 text-[11px] text-muted">Oldest received first — FIFO consumption order</p>
            </div>
            <div className="flex flex-wrap gap-6 text-right">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-secondary">Inventory Value</p>
                <p className="mt-0.5 text-sm font-bold tabular-nums text-ink">{formatINR(lotValue)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-secondary">Active Lots</p>
                <p className="mt-0.5 text-sm font-bold tabular-nums text-ink">{lots.filter((lot) => lot.quantityRemaining > 0).length}</p>
              </div>
            </div>
          </div>
          {(() => {
            const active = lots.filter((lot) => lot.quantityRemaining > 0);
            const split = (type: 'CHARITY' | 'EXPENSE' | null) => active.filter((lot) => lot.stockType === type);
            const qtyOf = (rows: typeof active) => rows.reduce((sum, lot) => sum + lot.quantityRemaining, 0);
            const valueOf = (rows: typeof active) => rows.reduce((sum, lot) => sum + (lot.unitCost ?? 0) * lot.quantityRemaining, 0);
            if (active.length === 0) return null;
            return (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {(['CHARITY', 'EXPENSE'] as const).map((type) => (
                  <div key={type} className="rounded-xl border border-border bg-background px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-secondary">{APP_CONSTANTS.stockType.labels[type]} stock</p>
                    <p className="mt-1 text-sm font-bold tabular-nums text-ink">{qtyOf(split(type))} {foodItem.unit?.symbol}</p>
                    <p className="mt-0.5 text-[11px] tabular-nums text-muted">{formatINR(valueOf(split(type)))}</p>
                  </div>
                ))}
                <div className="rounded-xl border border-border bg-background px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-secondary">Unclassified (legacy)</p>
                  <p className="mt-1 text-sm font-bold tabular-nums text-ink">{qtyOf(split(null))} {foodItem.unit?.symbol}</p>
                  <p className="mt-0.5 text-[11px] text-muted">Needs admin reconciliation</p>
                </div>
              </div>
            );
          })()}
          {lots.length === 0 ? (
            <p className="mt-4 text-sm text-secondary">No stock lots recorded for this item yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-background text-left text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">
                    <th className="px-3 py-2.5">Lot</th>
                    <th className="px-3 py-2.5">Vendor</th>
                    <th className="px-3 py-2.5">Received</th>
                    <th className="px-3 py-2.5">Type</th>
                    <th className="px-3 py-2.5 text-right">Original Qty</th>
                    <th className="px-3 py-2.5 text-right">Remaining</th>
                    <th className="px-3 py-2.5 text-right">Rate</th>
                    <th className="px-3 py-2.5 text-right">Value</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {lots.map((lot) => (
                    <tr key={lot.id} className="border-b border-border/60 last:border-0 hover:bg-background/60">
                      <td className="px-3 py-2.5 font-mono text-xs font-semibold text-ink">{lot.lotNumber}</td>
                      <td className="px-3 py-2.5 text-secondary">{lot.vendorName ?? '—'}</td>
                      <td className="px-3 py-2.5 text-xs tabular-nums text-secondary">{lot.receivedDate}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${lot.stockType === 'CHARITY' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : lot.stockType === 'EXPENSE' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>
                          {lot.stockType ? APP_CONSTANTS.stockType.labels[lot.stockType] : 'Unclassified'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-secondary">{lot.quantityReceived}</td>
                      <td className="px-3 py-2.5 text-right font-bold tabular-nums text-ink">{lot.quantityRemaining}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-secondary">{formatINR(lot.unitCost)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-ink">{formatINR(lot.totalCost)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${LOT_STATUS_STYLE[lot.status] ?? LOT_STATUS_STYLE.CONSUMED}`}>
                          {LOT_STATUS_LABEL[lot.status] ?? lot.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => setEditingLot(lot)}
                          title="Edit Stock Lot"
                          aria-label={`Edit stock lot ${lot.lotNumber}`}
                          className="inline-flex items-center justify-center rounded-lg border border-border-strong/60 p-1.5 text-secondary transition hover:border-primary hover:text-primary hover:bg-primary/5"
                        >
                          <PencilIcon className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <EditStockLotModal
        lot={editingLot}
        isOpen={!!editingLot}
        onClose={() => setEditingLot(null)}
        onSuccess={() => void load()}
      />
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
