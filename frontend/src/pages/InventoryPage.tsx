import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchFoodItemsList,
  fetchInventoryValuation,
  fetchStockLots,
  fetchStockSummary,
  formatINR,
  type FoodItemRow,
  type StockSummary,
} from '../features/inventory/api/inventory.api';
import { Skeleton } from '../components/ui/Skeleton';
import { ArrowRightIcon, TruckIcon } from '../components/ui/icons';
import { useAuth } from '../hooks/useAuth';
import { useStockModals } from '../features/inventory/context/StockModalContext';

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
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const { openStockIn, openStockOut } = useStockModals();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<FoodItemRow[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<StockSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // ADMIN-only valuation
  const [valuationTotal, setValuationTotal] = useState<number | null>(null);
  const [activeLots, setActiveLots] = useState<number | null>(null);

  const filters = useMemo(() => ({ search: search.trim() || undefined, page, pageSize: PAGE_SIZE }), [search, page]);

  const reload = () => {
    fetchFoodItemsList(filters)
      .then((result) => {
        setItems(result.foodItems);
        setTotal(result.total);
      })
      .catch(() => setError('Unable to load inventory.'));

    fetchStockSummary()
      .then(setSummary)
      .catch(() => {
        setSummary(null);
        setSummaryError('Could not load stock summary — KPI cards show unavailable totals.');
      });

    if (isAdmin) {
      Promise.all([
        fetchInventoryValuation(),
        fetchStockLots({ status: 'AVAILABLE', pageSize: 1 }),
        fetchStockLots({ status: 'PARTIALLY_CONSUMED', pageSize: 1 }),
      ])
        .then(([valuation, available, partial]) => {
          setValuationTotal(valuation.totalValue);
          setActiveLots(available.total + partial.total);
        })
        .catch(() => {
          setValuationTotal(null);
          setActiveLots(null);
        });
    }
  };

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
    fetchStockSummary()
      .then(setSummary)
      .catch(() => {
        setSummary(null);
        setSummaryError('Could not load stock summary — KPI cards show unavailable totals.');
      });
  }, []);

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
        if (!cancelled) {
          setValuationTotal(null);
          setActiveLots(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  useEffect(() => {
    const onRefresh = () => { reload(); };
    window.addEventListener('inventory-refresh', onRefresh);
    return () => window.removeEventListener('inventory-refresh', onRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, isAdmin]);

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
          <button type="button" onClick={() => openStockOut(null, reload)} className="inline-flex items-center gap-1.5 rounded-xl border border-danger/40 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-danger transition hover:bg-danger-soft"><TruckIcon className="h-4 w-4" />− Stock Out</button>
          <button type="button" onClick={() => openStockIn(null, reload)} className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-primary-foreground shadow-lift transition hover:bg-primary-dark">+ Stock In</button>
        </div>
      </div>

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
                          <button type="button" onClick={() => openStockIn(item, reload)} className="rounded-lg border border-border-strong/60 px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-primary hover:text-primary">+ Stock In</button>
                          {qty > 0 && (
                            <button type="button" onClick={() => openStockOut(item, reload)} className="rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger-soft">− Out</button>
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
