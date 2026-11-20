import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  fetchFifoPreview,
  fetchFoodItemsList,
  fetchInventoryValuation,
  fetchStockLots,
  fetchStockSummary,
  fetchVendors,
  formatINR,
  stockIn,
  stockOut,
  type FifoPreview,
  type FoodItemRow,
  type StockSummary,
  type VendorRow,
} from '../features/inventory/api/inventory.api';
import { fetchEvents } from '../features/events/api/events.api';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';
import { ArrowRightIcon, TruckIcon } from '../components/ui/icons';
import { FieldLabel } from '../components/ui/FieldLabel';
import { useAuth } from '../hooks/useAuth';
import { APP_CONSTANTS } from '../constants/appConstants';

const PAGE_SIZE = 20;
const FIFO_DEBOUNCE_MS = 300;
const QUANTITY_STEP = 10 ** -APP_CONSTANTS.quantityPrecision;

/** Local calendar date (YYYY-MM-DD) — toISOString() alone would use UTC. */
function todayIso(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** Accepts fractional quantities (kg/litres), rounded to the central precision. */
function parseQuantity(raw: string): number | null {
  if (raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  const factor = 10 ** APP_CONSTANTS.quantityPrecision;
  return Math.round(value * factor) / factor;
}

/** Display-only estimate; the backend always recalculates the lot's total cost. */
function stockInTotalPreview(qtyRaw: string, costRaw: string): number | null {
  const qty = parseQuantity(qtyRaw);
  if (costRaw.trim() === '' || qty === null) return null;
  const cost = Number(costRaw);
  if (!Number.isFinite(cost) || cost < 0) return null;
  return qty * cost;
}

type StockStatus = 'OUT' | 'CRITICAL' | 'LOW' | 'NORMAL';

function statusOf(item: { inventory?: { currentQuantity: number } | null; minimumStock: number; reorderLevel: number }): StockStatus {
  const qty = item.inventory?.currentQuantity ?? 0;
  if (qty === 0) return 'OUT';
  if (qty <= item.minimumStock) return 'CRITICAL';
  if (qty <= item.reorderLevel) return 'LOW';
  return 'NORMAL';
}

export function InventoryPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
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
  const [stockInVendorId, setStockInVendorId] = useState('');
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [stockInPurchaseDate, setStockInPurchaseDate] = useState('');
  const [stockInReceivedDate, setStockInReceivedDate] = useState(todayIso);
  const [stockInUnitCost, setStockInUnitCost] = useState('');
  const [stockInReference, setStockInReference] = useState('');
  const [stockInNotes, setStockInNotes] = useState('');
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

  // ADMIN-only FIFO preview + valuation (never rendered for Executors).
  const [fifoPreview, setFifoPreview] = useState<FifoPreview | null>(null);
  const [fifoAvailableByLot, setFifoAvailableByLot] = useState<Record<string, number>>({});
  const [fifoLoading, setFifoLoading] = useState(false);
  const [fifoError, setFifoError] = useState<string | null>(null);
  const [valuationTotal, setValuationTotal] = useState<number | null>(null);
  const [activeLots, setActiveLots] = useState<number | null>(null);

  // Picker rows cover the full catalogue (not just the visible page).
  useEffect(() => {
    fetchFoodItemsList({ pageSize: 100 })
      .then((r) => setPickerItems(r.foodItems))
      .catch(() => setPickerItems([]));
  }, []);

  // Active vendors power the optional Vendor dropdown in the Stock In modal.
  // A failed lookup simply leaves the dropdown on "None" — Stock In still works.
  useEffect(() => {
    fetchVendors({ isActive: 'true', pageSize: 100 })
      .then((r) => setVendors(r.vendors))
      .catch(() => setVendors([]));
  }, []);

  // Open Stock In / Stock Out when their deep-link appears (e.g. from the sidebar),
  // even if the page is already mounted.
  useEffect(() => {
    if (searchParams.get('stockIn') === '1') {
      setStockInItem(null);
      setStockInQty('');
      setStockInVendorId('');
      setStockInPurchaseDate('');
      setStockInReceivedDate(todayIso());
      setStockInUnitCost('');
      setStockInReference('');
      setStockInNotes('');
      setStockInError(null);
      setShowStockIn(true);
    }
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

  // Portfolio-level valuation + count of lots that still hold stock (ADMIN only).
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    Promise.all([
      fetchInventoryValuation(),
      fetchStockLots({ status: 'AVAILABLE', pageSize: 1 }),
      fetchStockLots({ status: 'PARTIALLY_CONSUMED', pageSize: 1 }),
    ])
      .then(([valuation, available, partial]) => {
        if (cancelled) return;
        setValuationTotal(valuation.totalValue);
        setActiveLots(available.total + partial.total);
      })
      .catch(() => {
        if (!cancelled) { setValuationTotal(null); setActiveLots(null); }
      });
    return () => { cancelled = true; };
  }, [isAdmin]);

  // Debounced FIFO calculation for the Stock Out modal. The server is the
  // source of truth; this is display-only and is recalculated on confirm.
  useEffect(() => {
    if (!isAdmin || !showStockOut) return;
    const qty = parseQuantity(stockOutQty);
    if (!stockOutItem || qty === null) {
      setFifoPreview(null);
      setFifoAvailableByLot({});
      setFifoError(null);
      setFifoLoading(false);
      return;
    }
    let cancelled = false;
    setFifoLoading(true);
    const timer = window.setTimeout(() => {
      Promise.all([
        fetchFifoPreview(stockOutItem.id, qty),
        fetchStockLots({ foodItemId: stockOutItem.id, pageSize: 100 }).catch(() => null),
      ])
        .then(([preview, lots]) => {
          if (cancelled) return;
          setFifoPreview(preview);
          const remaining: Record<string, number> = {};
          for (const lot of lots?.lots ?? []) remaining[lot.lotNumber] = lot.quantityRemaining;
          setFifoAvailableByLot(remaining);
          setFifoError(null);
        })
        .catch(() => {
          if (cancelled) return;
          setFifoPreview(null);
          setFifoError('Could not load the FIFO preview. You can still record stock out.');
        })
        .finally(() => { if (!cancelled) setFifoLoading(false); });
    }, FIFO_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isAdmin, showStockOut, stockOutItem, stockOutQty]);

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

  const resetStockInFields = () => {
    setStockInVendorId('');
    setStockInPurchaseDate('');
    setStockInReceivedDate(todayIso());
    setStockInUnitCost('');
    setStockInReference('');
    setStockInNotes('');
    setStockInError(null);
  };

  const closeStockIn = () => {
    setShowStockIn(false);
    resetStockInFields();
    if (searchParams.has('stockIn')) setSearchParams({}, { replace: true });
  };

  const openStockInFor = (item: FoodItemRow | null) => {
    setStockInItem(item);
    setStockInQty('');
    resetStockInFields();
    setShowStockIn(true);
  };

  const closeStockOut = () => {
    setShowStockOut(false);
    setFifoPreview(null);
    setFifoError(null);
    if (searchParams.has('stockOut')) setSearchParams({}, { replace: true });
  };

  const openStockOutFor = (item: FoodItemRow) => {
    setStockOutItem(item);
    setStockOutQty('');
    setStockOutReason('');
    setStockOutEventId('');
    setStockOutError(null);
    setFifoPreview(null);
    setFifoError(null);
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
    const qty = parseQuantity(stockOutQty);
    if (qty === null) {
      setStockOutError(`Quantity must be a positive number (up to ${APP_CONSTANTS.quantityPrecision} decimals).`);
      return;
    }
    if (fifoPreview && !fifoPreview.sufficient) {
      setStockOutError('Not enough stock is available in the FIFO lots to cover this issue.');
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
      setFifoPreview(null);
      setFifoError(null);
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
    if (!stockInItem) {
      setStockInError('Choose a food item first.');
      return;
    }
    const qty = parseQuantity(stockInQty);
    if (qty === null) {
      setStockInError(`Quantity must be a positive number (up to ${APP_CONSTANTS.quantityPrecision} decimals).`);
      return;
    }
    const unitCost = stockInUnitCost.trim() === '' ? undefined : Number(stockInUnitCost);
    if (unitCost !== undefined && (!Number.isFinite(unitCost) || unitCost < 0)) {
      setStockInError('Unit cost must be zero or a positive number.');
      return;
    }
    setIsBusy(true);
    try {
      await stockIn(stockInItem.id, qty, stockInVendorId || null, {
        purchaseDate: stockInPurchaseDate || undefined,
        receivedDate: stockInReceivedDate || undefined,
        unitCost,
        referenceNumber: stockInReference.trim() || undefined,
        notes: stockInNotes.trim() || undefined,
      });
      const previewTotal = stockInTotalPreview(stockInQty, stockInUnitCost);
      setNotice(
        `Stock In recorded for ${stockInItem.name} (+${qty} ${stockInItem.unit.symbol}). New lot created${previewTotal === null ? '' : ` · value ${formatINR(previewTotal)}`}.`,
      );
      setShowStockIn(false);
      setStockInItem(null);
      setStockInQty('');
      resetStockInFields();
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
          <button type="button" onClick={() => openStockInFor(null)} className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-primary-foreground shadow-lift transition hover:bg-primary-dark">+ Stock In</button>
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

      {isAdmin && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-3.5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">Total Stock Value</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-ink">{valuationTotal === null ? '—' : formatINR(valuationTotal)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">Active Lots</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-ink">{activeLots ?? '—'}</p>
          </div>
        </div>
      )}

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
                          <button type="button" onClick={() => openStockInFor(item)} className="rounded-lg border border-border-strong/60 px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-primary hover:text-primary">+ Stock In</button>
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
        <Modal title="Stock In" onClose={closeStockIn} maxWidthClass="max-w-lg">
          <div className="space-y-4">
            <div>
              <FieldLabel htmlFor="stock-item" className="mb-1.5 block text-xs font-semibold text-ink">Food Item</FieldLabel>
              <select id="stock-item" value={stockInItem?.id ?? ''} onChange={(e) => setStockInItem(pickerItems.find((item) => item.id === e.target.value) ?? items.find((item) => item.id === e.target.value) ?? null)} className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25">
                <option value="">Select food item…</option>
                {(pickerItems.length ? pickerItems : items).map((item) => (
                  <option key={item.id} value={item.id}>{item.name} — in stock {item.inventory?.currentQuantity ?? 0} {item.unit.symbol}</option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="stock-vendor" className="mb-1.5 block text-xs font-semibold text-ink">Vendor <span className="font-normal text-muted">(optional)</span></FieldLabel>
              <select id="stock-vendor" value={stockInVendorId} onChange={(e) => setStockInVendorId(e.target.value)} className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25">
                <option value="">None</option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
                ))}
              </select>
              <p className="mt-1.5 text-[10px] leading-snug text-muted">Credit this delivery to a vendor — it will appear on the ledger entry.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="stock-purchase-date" className="mb-1.5 block text-xs font-semibold text-ink">Purchase Date <span className="font-normal text-muted">(optional)</span></FieldLabel>
                <input id="stock-purchase-date" type="date" value={stockInPurchaseDate} onChange={(e) => setStockInPurchaseDate(e.target.value)} className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />
              </div>
              <div>
                <FieldLabel htmlFor="stock-received-date" className="mb-1.5 block text-xs font-semibold text-ink">Received Date *</FieldLabel>
                <input id="stock-received-date" type="date" value={stockInReceivedDate} onChange={(e) => setStockInReceivedDate(e.target.value)} className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="stock-qty" className="mb-1.5 block text-xs font-semibold text-ink">Quantity received *</FieldLabel>
                <input id="stock-qty" type="number" min={QUANTITY_STEP} step={QUANTITY_STEP} value={stockInQty} onChange={(e) => setStockInQty(e.target.value)} placeholder="e.g. 50" className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />
              </div>
              <div>
                <FieldLabel htmlFor="stock-unit-cost" className="mb-1.5 block text-xs font-semibold text-ink">Unit Cost <span className="font-normal text-muted">(optional)</span></FieldLabel>
                <input id="stock-unit-cost" type="number" min={0} step={0.01} value={stockInUnitCost} onChange={(e) => setStockInUnitCost(e.target.value)} placeholder="e.g. 120.50" className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />
              </div>
            </div>
            {isAdmin && (
              <div className="flex items-baseline justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-secondary">Total Cost (estimated)</span>
                <span className="text-base font-bold tabular-nums text-ink">{formatINR(stockInTotalPreview(stockInQty, stockInUnitCost))}</span>
              </div>
            )}
            <div>
              <FieldLabel htmlFor="stock-reference" className="mb-1.5 block text-xs font-semibold text-ink">Reference / Invoice Number <span className="font-normal text-muted">(optional)</span></FieldLabel>
              <input id="stock-reference" type="text" value={stockInReference} onChange={(e) => setStockInReference(e.target.value)} maxLength={100} placeholder="e.g. INV-2026-0142" className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />
            </div>
            <div>
              <FieldLabel htmlFor="stock-notes" className="mb-1.5 block text-xs font-semibold text-ink">Notes <span className="font-normal text-muted">(optional)</span></FieldLabel>
              <textarea id="stock-notes" rows={2} value={stockInNotes} onChange={(e) => setStockInNotes(e.target.value)} maxLength={500} placeholder="Delivery condition, batch remarks…" className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />
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
        <Modal title="Stock Out" onClose={closeStockOut} maxWidthClass="max-w-2xl">
          <div className="space-y-4">
            <div>
              <FieldLabel htmlFor="stock-out-item" className="mb-1.5 block text-xs font-semibold text-ink">Food Item</FieldLabel>
              <select id="stock-out-item" value={stockOutItem?.id ?? ''} onChange={(e) => setStockOutItem(pickerItems.find((item) => item.id === e.target.value) ?? items.find((item) => item.id === e.target.value) ?? null)} className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25">
                <option value="">Select food item…</option>
                {(pickerItems.length ? pickerItems : items).map((item) => (
                  <option key={item.id} value={item.id}>{item.name} — in stock {item.inventory?.currentQuantity ?? 0} {item.unit.symbol}</option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="stock-out-qty" className="mb-1.5 block text-xs font-semibold text-ink">Quantity to issue *</FieldLabel>
              <input id="stock-out-qty" type="number" min={QUANTITY_STEP} step={QUANTITY_STEP} value={stockOutQty} onChange={(e) => setStockOutQty(e.target.value)} autoFocus placeholder="e.g. 50" className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />
              {stockOutItem && (
                <p className="mt-1.5 text-[10px] leading-snug text-muted">Max available: <span className="font-semibold text-ink">{stockOutItem.inventory?.currentQuantity ?? 0} {stockOutItem.unit.symbol}</span></p>
              )}
            </div>
            <div>
              <FieldLabel htmlFor="stock-out-reason" className="mb-1.5 block text-xs font-semibold text-ink">Reason *</FieldLabel>
              <input id="stock-out-reason" type="text" value={stockOutReason} onChange={(e) => setStockOutReason(e.target.value)} placeholder="e.g. Issued to event, Used in kitchen, Damaged" maxLength={500} className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />
            </div>
            <div>
              <FieldLabel htmlFor="stock-out-event" className="mb-1.5 block text-xs font-semibold text-ink">Issue to event <span className="font-normal text-muted">(optional)</span></FieldLabel>
              <select id="stock-out-event" value={stockOutEventId} onChange={(e) => setStockOutEventId(e.target.value)} className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25">
                <option value="">No event linked</option>
                {recentEvents.map((event) => (
                  <option key={event.id} value={event.id}>{event.eventCode} — {event.name}</option>
                ))}
              </select>
              <p className="mt-1.5 text-[10px] leading-snug text-muted">Stock Out writes a ledger row and audit entry. This is a real stock movement — it cannot be undone.</p>
            </div>
            {isAdmin && (
              <section className="rounded-xl border border-border bg-background/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">FIFO Allocation</h3>
                  {fifoLoading && <span className="text-[10px] font-semibold text-primary">Calculating…</span>}
                </div>
                {fifoError ? (
                  <p role="status" className="mt-2 text-[11px] text-amber-800">{fifoError}</p>
                ) : fifoPreview && fifoPreview.allocations.length > 0 ? (
                  <>
                    <div className="mt-2 overflow-x-auto rounded-lg border border-border bg-card">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="border-b border-border text-left text-[9px] font-bold uppercase tracking-wider text-secondary">
                            <th className="px-2 py-2">Lot</th>
                            <th className="px-2 py-2">Vendor</th>
                            <th className="px-2 py-2">Received</th>
                            <th className="px-2 py-2 text-right">Available</th>
                            <th className="px-2 py-2 text-right">Rate</th>
                            <th className="px-2 py-2 text-right">To Issue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fifoPreview.allocations.map((allocation, index) => (
                            <tr key={`${allocation.lotNumber}-${index}`} className="border-b border-border/60 last:border-0">
                              <td className="px-2 py-2 font-mono font-semibold text-ink">{allocation.lotNumber}</td>
                              <td className="px-2 py-2 text-secondary">{allocation.vendorName ?? '—'}</td>
                              <td className="px-2 py-2 tabular-nums text-secondary">{allocation.receivedDate}</td>
                              <td className="px-2 py-2 text-right tabular-nums text-secondary">{fifoAvailableByLot[allocation.lotNumber] ?? '—'}</td>
                              <td className="px-2 py-2 text-right tabular-nums text-secondary">{formatINR(allocation.unitCost)}</td>
                              <td className="px-2 py-2 text-right font-bold tabular-nums text-ink">{allocation.quantityAllocated}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <dl className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <dt className="text-[9px] font-bold uppercase tracking-wider text-secondary">Requested Qty</dt>
                        <dd className="mt-0.5 font-bold tabular-nums text-ink">{fifoPreview.requestedQuantity}</dd>
                      </div>
                      <div>
                        <dt className="text-[9px] font-bold uppercase tracking-wider text-secondary">FIFO Cost</dt>
                        <dd className="mt-0.5 font-bold tabular-nums text-ink">{formatINR(fifoPreview.totalCost)}</dd>
                      </div>
                      <div>
                        <dt className="text-[9px] font-bold uppercase tracking-wider text-secondary">Average Cost</dt>
                        <dd className="mt-0.5 font-bold tabular-nums text-ink">{formatINR(fifoPreview.averageCost)}</dd>
                      </div>
                    </dl>
                    {!fifoPreview.sufficient && (
                      <p role="alert" className="mt-2 text-[11px] font-bold text-danger">
                        Insufficient stock — only {fifoPreview.availableQuantity} available in FIFO lots.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="mt-2 text-[11px] text-secondary">
                    {fifoLoading ? 'Loading FIFO allocation…' : 'Choose an item and enter a quantity to preview the FIFO allocation.'}
                  </p>
                )}
                <p className="mt-2 border-t border-border/60 pt-2 text-[10px] leading-snug text-muted">
                  The system will issue the oldest available stock first. The preview is recalculated when you confirm.
                </p>
              </section>
            )}
            {stockOutError && <p role="alert" className="text-xs font-semibold text-danger">{stockOutError}</p>}
            <div className="flex items-center justify-end gap-3">
              <button type="button" onClick={closeStockOut} className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-background">Cancel</button>
              <button type="button" disabled={isStockOutBusy || (isAdmin && fifoPreview?.sufficient === false)} onClick={() => void handleStockOut()} className="inline-flex items-center gap-2 rounded-xl bg-danger px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-70">
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
