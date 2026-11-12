import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchFoodItemsList, fetchStockSummary, stockIn, stockOut, type FoodItemRow, type StockSummary } from '../features/inventory/api/inventory.api';
import { fetchEvents } from '../features/events/api/events.api';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';
import { ArrowRightIcon, TruckIcon } from '../components/ui/icons';

const PAGE_SIZE = 20;

type StockStatus = 'OUT' | 'CRITICAL' | 'LOW' | 'NORMAL';

function statusOf(item: { inventory?: { currentQuantity: number } | null; minimumStock: number; reorderLevel: number }): StockStatus {
  const qty = item.inventory?.currentQuantity ?? 0;
  if (qty === 0) return 'OUT';
  if (qty <= item.minimumStock) return 'CRITICAL';
  if (qty <= item.reorderLevel) return 'LOW';
  return 'NORMAL';
}

export function InventoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<FoodItemRow[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<StockSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [stockInItem, setStockInItem] = useState<FoodItemRow | null>(null);
  const [stockInQty, setStockInQty] = useState('');
  const [stockInError, setStockInError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [showStockIn, setShowStockIn] = useState(searchParams.get('stockIn') === '1');

  // Stock Out state
  const [showStockOut, setShowStockOut] = useState(searchParams.get('stockOut') === '1');
  const [stockOutItem, setStockOutItem] = useState<FoodItemRow | null>(null);
  const [stockOutQty, setStockOutQty] = useState('');
  const [stockOutReason, setStockOutReason] = useState('');
  const [stockOutEventId, setStockOutEventId] = useState('');
  const [stockOutError, setStockOutError] = useState<string | null>(null);
  const [isStockOutBusy, setIsStockOutBusy] = useState(false);
  const [recentEvents, setRecentEvents] = useState<{ id: string; name: string; eventCode: string }[]>([]);
  const [pickerItems, setPickerItems] = useState<FoodItemRow[]>([]);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Picker rows cover the full catalogue (not just the visible page).
  useEffect(() => {
    fetchFoodItemsList({ pageSize: 100 })
      .then((r) => setPickerItems(r.foodItems))
      .catch(() => setPickerItems([]));
  }, []);

  // Open Stock In / Stock Out when their deep-link appears (e.g. from the sidebar),
  // even if the page is already mounted.
  useEffect(() => {
    if (searchParams.get('stockIn') === '1') setShowStockIn(true);
    if (searchParams.get('stockOut') === '1') setShowStockOut(true);
  }, [searchParams]);

  // Recent events power the optional "Issue to Event" link in the Stock Out modal.
  useEffect(() => {
    fetchEvents({ pageSize: 10 })
      .then((r) => setRecentEvents(r.events.map((e) => ({ id: e.id, name: e.name, eventCode: e.eventCode }))))
      .catch(() => setRecentEvents([]));
  }, []);

  const filters = useMemo(() => ({ search: search.trim() || undefined, page, pageSize: PAGE_SIZE }), [search, page]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchFoodItemsList(filters)
      .then((result) => {
        if (cancelled) return;
        setItems(result.foodItems);
        setTotal(result.total);
      })
      .catch(() => {
        if (!cancelled) setError('Unable to load inventory.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    fetchStockSummary().then(setSummary).catch(() => { setSummary(null); setSummaryError('Could not load stock summary — KPI cards show unavailable totals.'); });
  }, []);

  const totals = useMemo(() => {
    return {
      totalItems: summary?.totalItems ?? total,
      totalLines: summary?.totalStockLines ?? total,
      low: summary?.lowStock ?? 0,
      reorder: summary?.reorderRequired ?? 0,
      out: summary?.outOfStock ?? 0,
      healthy: summary?.healthy ?? 0,
    };
  }, [summary, total]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const closeStockIn = () => {
    setShowStockIn(false);
    if (searchParams.has('stockIn')) setSearchParams({}, { replace: true });
  };

  const closeStockOut = () => {
    setShowStockOut(false);
    if (searchParams.has('stockOut')) setSearchParams({}, { replace: true });
  };

  const openStockOutFor = (item: FoodItemRow) => {
    setStockOutItem(item);
    setStockOutQty('');
    setStockOutReason('');
    setStockOutEventId('');
    setStockOutError(null);
    setShowStockOut(true);
  };

  const handleStockOut = async () => {
    setStockOutError(null);
    // Never silently fall back to items[0] — the user must pick explicitly.
    const item: FoodItemRow | null = stockOutItem ?? null;
    if (!item) {
      setStockOutError('Choose a food item first.');
      return;
    }
    const qty = Number.parseInt(stockOutQty, 10);
    if (!Number.isInteger(qty) || qty <= 0) {
      setStockOutError('Quantity must be a positive whole number.');
      return;
    }
    const available = item.inventory?.currentQuantity ?? 0;
    if (qty > available) {
      setStockOutError(`Not enough stock — only ${available} ${item.unit.symbol} available.`);
      return;
    }
    if (!stockOutReason.trim()) {
      setStockOutError('A reason is required (e.g. "Issued to event", "Used in kitchen", "Damaged").');
      return;
    }
    setIsStockOutBusy(true);
    try {
      await stockOut(
        item.id,
        qty,
        stockOutEventId
          ? { reason: stockOutReason.trim(), referenceType: 'EVENT', referenceId: stockOutEventId }
          : { reason: stockOutReason.trim() },
      );
      setNotice(`Stock Out recorded for ${item.name} (−${qty} ${item.unit.symbol}).`);
      setShowStockOut(false);
      setStockOutItem(null);
      setStockOutQty('');
      setStockOutReason('');
      setStockOutEventId('');
      if (searchParams.has('stockOut')) setSearchParams({}, { replace: true });
      fetchFoodItemsList(filters).then((r) => { setItems(r.foodItems); setTotal(r.total); }).catch(() => undefined);
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setStockOutError(msg ?? 'Stock Out failed. Please try again.');
    } finally {
      setIsStockOutBusy(false);
    }
  };

  const handleStockIn = async () => {
    setStockInError(null);
    const qty = Number.parseInt(stockInQty, 10);
    if (!stockInItem) {
      setStockInError('Choose a food item first.');
      return;
    }
    if (!Number.isInteger(qty) || qty <= 0) {
      setStockInError('Quantity must be a positive whole number.');
      return;
    }
    setIsBusy(true);
    try {
      await stockIn(stockInItem.id, qty);
      setNotice(`Stock In recorded for ${stockInItem.name} (+${qty} ${stockInItem.unit.symbol}).`);
      setShowStockIn(false);
      setStockInItem(null);
      setStockInQty('');
      if (searchParams.has('stockIn')) setSearchParams({}, { replace: true });
      fetchFoodItemsList(filters).then((r) => { setItems(r.foodItems); setTotal(r.total); }).catch(() => undefined);
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setStockInError(msg ?? 'Stock In failed. Please try again.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-primary">Inventory</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Current Stock</h1>
          <p className="mt-1 text-sm text-secondary">Live levels against each item's minimum and reorder thresholds.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/inventory/food-items" className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-xs font-semibold text-ink transition hover:border-primary hover:text-primary">Food Items →</Link>
          <Link to="/inventory/categories" className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-xs font-semibold text-ink transition hover:border-primary hover:text-primary">Categories →</Link>
          <Link to="/inventory/units" className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-xs font-semibold text-ink transition hover:border-primary hover:text-primary">Units →</Link>
          <Link to="/inventory/ledger" className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-xs font-semibold text-ink transition hover:border-primary hover:text-primary">Ledger →</Link>
          <button type="button" onClick={() => { setStockOutItem(null); setStockOutQty(''); setStockOutReason(''); setStockOutEventId(''); setStockOutError(null); setShowStockOut(true); }} className="inline-flex items-center gap-1.5 rounded-xl border border-danger/40 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-danger transition hover:bg-danger-soft"><TruckIcon className="h-4 w-4" />− Stock Out</button>
          <button type="button" onClick={() => setShowStockIn(true)} className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-primary-foreground shadow-lift transition hover:bg-primary-dark">+ Stock In</button>
        </div>
      </div>

      {notice && <div role="status" className="rounded-xl border border-[#1e7a3c]/25 bg-[#e9f7ee] px-4 py-3 text-sm font-medium text-[#145c2c]">{notice}</div>}
      {summaryError && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{summaryError}</div>}
      {error && <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

      {/* Summary tiles — backend-calculated (spec §15) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <SummaryTile label="Total Items" value={totals.totalItems} tone="text-ink" />
        <SummaryTile label="Stock Lines" value={totals.totalLines} tone="text-ink" />
        <SummaryTile label="Low Stock" value={totals.low} tone="text-amber-700" />
        <SummaryTile label="Reorder Required" value={totals.reorder} tone="text-orange-800" />
        <SummaryTile label="Out of Stock" value={totals.out} tone="text-red-800" />
        <SummaryTile label="Healthy" value={totals.healthy} tone="text-emerald-700" />
      </div>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search food items…"
        aria-label="Search inventory"
        className="w-full rounded-xl border border-border-strong/70 bg-card px-4 py-3 text-sm outline-none transition placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/25"
      />

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-2xl" />)}</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-strong/70 bg-card p-12 text-center">
          <p className="text-base font-bold text-ink">No items match</p>
          <p className="mt-1 text-sm text-secondary">Try a different search term.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background text-left text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">
                    <Link to="/inventory/categories" title="Add or edit categories" className="inline-flex items-center gap-1.5 transition hover:text-primary">
                      Category
                      <ArrowRightIcon className="h-3 w-3" />
                    </Link>
                  </th>
                  <th className="px-4 py-3 text-right">Stock</th>
                  <th className="px-4 py-3 text-right">Min</th>
                  <th className="px-4 py-3 text-right">Reorder</th>
                  <th className="px-4 py-3">Stock Status</th>
                  <th className="px-4 py-3">Last Updated</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const status = statusOf(item);
                  const qty = item.inventory?.currentQuantity ?? 0;
                  return (
                    <tr key={item.id} className="border-b border-border/60 transition last:border-0 hover:bg-background/60">
                      <td className="px-4 py-3 font-semibold text-ink">{item.name}</td>
                      <td className="px-4 py-3 text-secondary">{item.category?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums text-ink">{qty} <span className="text-[10px] font-medium text-muted">{item.unit.symbol}</span></td>
                      <td className="px-4 py-3 text-right tabular-nums text-secondary">{item.minimumStock}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-secondary">{item.reorderLevel}</td>
                      <td className="px-4 py-3"><StockBadge status={status} /></td>
                      <td className="px-4 py-3 text-xs tabular-nums text-muted">{item.inventory?.updatedAt ? new Date(item.inventory.updatedAt).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link to={`/inventory/food-items/${item.id}`} className="rounded-lg border border-border-strong/60 px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-primary hover:text-primary">View</Link>
                          <button type="button" onClick={() => { setStockInItem(item); setStockInQty(''); setStockInError(null); setShowStockIn(true); }} className="rounded-lg border border-border-strong/60 px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-primary hover:text-primary">+ Stock In</button>
                          {qty > 0 && (
                            <button type="button" onClick={() => openStockOutFor(item)} className="rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger-soft">− Out</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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

      {showStockIn && (
        <Modal title="Stock In" onClose={closeStockIn} maxWidthClass="max-w-md">
          <div className="space-y-4">
            <div>
              <label htmlFor="stock-item" className="mb-1.5 block text-xs font-semibold text-ink">Food Item</label>
              <select id="stock-item" value={stockInItem?.id ?? ''} onChange={(e) => setStockInItem(pickerItems.find((item) => item.id === e.target.value) ?? items.find((item) => item.id === e.target.value) ?? null)} className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25">
                <option value="">Select food item…</option>
                {(pickerItems.length ? pickerItems : items).map((item) => (
                  <option key={item.id} value={item.id}>{item.name} — in stock {item.inventory?.currentQuantity ?? 0} {item.unit.symbol}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="stock-qty" className="mb-1.5 block text-xs font-semibold text-ink">Quantity received *</label>
              <input id="stock-qty" type="number" min={1} step={1} value={stockInQty} onChange={(e) => setStockInQty(e.target.value)} autoFocus placeholder="e.g. 50" className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />
            </div>
            {stockInError && <p role="alert" className="text-xs font-semibold text-danger">{stockInError}</p>}
            <div className="flex items-center justify-end gap-3">
              <button type="button" onClick={closeStockIn} className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-background">Cancel</button>
              <button type="button" disabled={isBusy} onClick={() => void handleStockIn()} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-dark disabled:opacity-70">{isBusy ? 'Recording…' : 'Record Stock In'}</button>
            </div>
          </div>
        </Modal>
      )}

      {showStockOut && (
        <Modal title="Stock Out" onClose={closeStockOut} maxWidthClass="max-w-md">
          <div className="space-y-4">
            <div>
              <label htmlFor="stock-out-item" className="mb-1.5 block text-xs font-semibold text-ink">Food Item</label>
              <select id="stock-out-item" value={stockOutItem?.id ?? ''} onChange={(e) => setStockOutItem(pickerItems.find((item) => item.id === e.target.value) ?? items.find((item) => item.id === e.target.value) ?? null)} className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25">
                <option value="">Select food item…</option>
                {(pickerItems.length ? pickerItems : items).map((item) => (
                  <option key={item.id} value={item.id}>{item.name} — in stock {item.inventory?.currentQuantity ?? 0} {item.unit.symbol}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="stock-out-qty" className="mb-1.5 block text-xs font-semibold text-ink">Quantity to issue *</label>
              <input id="stock-out-qty" type="number" min={1} step={1} value={stockOutQty} onChange={(e) => setStockOutQty(e.target.value)} autoFocus placeholder="e.g. 50" className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />
              {stockOutItem && (
                <p className="mt-1.5 text-[10px] leading-snug text-muted">Max available: <span className="font-semibold text-ink">{stockOutItem.inventory?.currentQuantity ?? 0} {stockOutItem.unit.symbol}</span></p>
              )}
            </div>
            <div>
              <label htmlFor="stock-out-reason" className="mb-1.5 block text-xs font-semibold text-ink">Reason *</label>
              <input id="stock-out-reason" type="text" value={stockOutReason} onChange={(e) => setStockOutReason(e.target.value)} placeholder="e.g. Issued to event, Used in kitchen, Damaged" maxLength={500} className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />
            </div>
            <div>
              <label htmlFor="stock-out-event" className="mb-1.5 block text-xs font-semibold text-ink">Issue to event <span className="font-normal text-muted">(optional)</span></label>
              <select id="stock-out-event" value={stockOutEventId} onChange={(e) => setStockOutEventId(e.target.value)} className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25">
                <option value="">No event linked</option>
                {recentEvents.map((event) => (
                  <option key={event.id} value={event.id}>{event.eventCode} — {event.name}</option>
                ))}
              </select>
              <p className="mt-1.5 text-[10px] leading-snug text-muted">Stock Out writes a ledger row and audit entry. This is a real stock movement — it cannot be undone.</p>
            </div>
            {stockOutError && <p role="alert" className="text-xs font-semibold text-danger">{stockOutError}</p>}
            <div className="flex items-center justify-end gap-3">
              <button type="button" onClick={closeStockOut} className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-background">Cancel</button>
              <button type="button" disabled={isStockOutBusy} onClick={() => void handleStockOut()} className="inline-flex items-center gap-2 rounded-xl bg-danger px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-70">
                <TruckIcon className="h-4 w-4" />
                {isStockOutBusy ? 'Issuing…' : 'Record Stock Out'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3 text-center shadow-sm">
      <p className={`text-2xl font-bold tabular-nums ${tone}`}>{value}</p>
      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{label}</p>
    </div>
  );
}

function StockBadge({ status }: { status: StockStatus }) {
  const styles: Record<StockStatus, string> = {
    OUT: 'border-red-200 bg-red-50 text-red-800',
    CRITICAL: 'border-orange-200 bg-orange-50 text-orange-800',
    LOW: 'border-amber-200 bg-amber-50 text-amber-800',
    NORMAL: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  };
  const labels: Record<StockStatus, string> = {
    OUT: '× Out of Stock',
    CRITICAL: '! Low Stock',
    LOW: '↻ Reorder',
    NORMAL: '● Healthy',
  };
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${styles[status]}`}>{labels[status]}</span>;
}
