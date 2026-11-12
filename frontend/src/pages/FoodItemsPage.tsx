import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { createFoodItem, fetchFoodItemsList, updateFoodItem, type FoodItemRow } from '../features/inventory/api/inventory.api';
import { fetchCategories, type CategoryRow, fetchUnitsList, type UnitRow } from '../features/inventory/api/inventory.api';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';
import {
  ArchiveIcon,
  CheckIcon,
  DescriptionIcon,
  GaugeIcon,
  LayersIcon,
  PencilIcon,
  PlusIcon,
  RulerIcon,
  SearchIcon,
  TagIcon,
} from '../components/ui/icons';

const PAGE_SIZE = 15;

export function FoodItemsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [isActive, setIsActive] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<FoodItemRow[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<FoodItemRow | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const toggleActive = async (target: FoodItemRow) => {
    setTogglingId(target.id);
    setError(null);
    try {
      await updateFoodItem(target.id, { isActive: !target.isActive });
      setNotice(target.isActive ? `“${target.name}” deactivated.` : `“${target.name}” activated.`);
      reload();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? 'Could not update the item status.');
    } finally {
      setTogglingId(null);
    }
  };
  const [showCreate, setShowCreate] = useState(searchParams.get('new') === '1');

  const filters = useMemo(
    () => ({
      search: search.trim() || undefined,
      categoryId: categoryId || undefined,
      isActive: isActive === '' ? undefined : isActive === 'true',
      page,
      pageSize: PAGE_SIZE,
    }),
    [search, categoryId, isActive, page],
  );

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
        if (!cancelled) setError('Unable to load food items.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [filters]);

  useEffect(() => {
    fetchCategories({ pageSize: 100, isActive: true }).then((r) => setCategories(r.categories)).catch(() => setCategories([]));
    fetchUnitsList({ pageSize: 100, isActive: true }).then((r) => setUnits(r.units)).catch(() => setUnits([]));
  }, []);

  useEffect(() => { setPage(1); }, [search, categoryId, isActive]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const reload = () => fetchFoodItemsList(filters).then((r) => { setItems(r.foodItems); setTotal(r.total); }).catch(() => undefined);

  const closeCreate = () => {
    setShowCreate(false);
    if (searchParams.has('new')) setSearchParams({}, { replace: true });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-primary">Inventory</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Food Item Master</h1>
          <p className="mt-1 text-sm text-secondary">Master catalogue used across events, planning and stock control.</p>
        </div>
        <button type="button" onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lift transition hover:bg-primary-dark"><PlusIcon className="h-4 w-4" />New Food Item</button>
      </div>

      {notice && <div role="status" className="rounded-xl border border-[#1e7a3c]/25 bg-[#e9f7ee] px-4 py-3 text-sm font-medium text-[#145c2c]">{notice}</div>}
      {error && <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-4 md:grid-cols-4">
        <div className="relative md:col-span-2">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items…" aria-label="Search food items" className="w-full rounded-xl border border-border-strong/70 bg-white py-2.5 pl-10 pr-3.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />
        </div>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Filter by category" className="rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary">
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={isActive} onChange={(e) => setIsActive(e.target.value as '' | 'true' | 'false')} aria-label="Filter by status" className="rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary">
          <option value="">All statuses</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-2xl" />)}</div>
      ) : items.length === 0 && !error ? (
        <div className="rounded-2xl border border-dashed border-border-strong/70 bg-card p-12 text-center">
          <p className="text-base font-bold text-ink">No food items found</p>
          <p className="mt-1 text-sm text-secondary">Create your first item to start tracking stock.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background text-left text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Unit</th>
                  <th className="px-4 py-3 text-right">Min</th>
                  <th className="px-4 py-3 text-right">Reorder</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-border/60 transition last:border-0 hover:bg-background/60">
                    <td className="px-4 py-3 font-semibold text-ink">{item.name}</td>
                    <td className="px-4 py-3 text-secondary">{item.category?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-secondary">{item.unit.symbol}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-secondary">{item.minimumStock}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-secondary">{item.reorderLevel}</td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${item.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>{item.isActive ? 'Active' : 'Inactive'}</span></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link to={`/inventory/food-items/${item.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong/60 px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-primary hover:text-primary">View</Link>
                        <button type="button" onClick={() => setEditing(item)} className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong/60 px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-primary hover:text-primary"><PencilIcon className="h-3.5 w-3.5" />Edit</button>
                        <button
                          type="button"
                          disabled={togglingId === item.id}
                          onClick={() => void toggleActive(item)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${item.isActive ? 'border-danger/40 text-danger hover:bg-danger-soft' : 'border-emerald-300 text-emerald-800 hover:bg-emerald-50'}`}
                        >
                          {togglingId === item.id ? '…' : item.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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

      {showCreate && <FoodItemFormModal mode="create" categories={categories} units={units} onClose={closeCreate} onSaved={(item) => { closeCreate(); setNotice(`“${item.name}” created.`); reload(); }} />}
      {editing && <FoodItemFormModal mode="edit" item={editing} categories={categories} units={units} onClose={() => setEditing(null)} onSaved={(item) => { setEditing(null); setNotice(`“${item.name}” updated.`); reload(); }} />}
    </div>
  );
}

function FoodItemFormModal({
  mode,
  item,
  categories,
  units,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  item?: FoodItemRow;
  categories: CategoryRow[];
  units: UnitRow[];
  onClose: () => void;
  onSaved: (item: FoodItemRow) => void;
}) {
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [categoryName, setCategoryName] = useState(item?.category?.name ?? '');
  const [unitSymbol, setUnitSymbol] = useState(item?.unit?.symbol ?? '');
  const [minimumStock, setMinimumStock] = useState(String(item?.minimumStock ?? '10'));
  const [reorderLevel, setReorderLevel] = useState(String(item?.reorderLevel ?? '20'));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const noCategories = mode === 'create' && categories.length === 0;
  const noUnits = mode === 'create' && units.length === 0;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const min = Number.parseInt(minimumStock, 10);
    const reorder = Number.parseInt(reorderLevel, 10);
    if (!name.trim()) { setError('Name is required.'); return; }
    if (mode === 'create' && categories.length === 0) { setError('Create at least one category before creating an item.'); return; }
    if (mode === 'create' && units.length === 0) { setError('Create at least one unit before creating an item.'); return; }
    if (mode === 'create' && (!categoryName || !unitSymbol)) { setError('Category and unit are required.'); return; }
    if (!Number.isFinite(min) || min < 0 || !Number.isFinite(reorder) || reorder < 0) { setError('Thresholds must be zero or greater.'); return; }
    if (reorder < min) { setError('Reorder level must be greater than or equal to minimum stock.'); return; }
    setIsSaving(true);
    try {
      const saved = mode === 'create'
        ? await createFoodItem({ name: name.trim(), description: description.trim() || undefined, categoryName, unitSymbol, minimumStock: min, reorderLevel: reorder })
        : await updateFoodItem(item!.id, { name: name.trim(), description: description.trim() || undefined, minimumStock: min, reorderLevel: reorder });
      onSaved(saved);
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? 'Could not save the food item.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal title={mode === 'create' ? 'Create Food Item' : 'Edit Food Item'} onClose={onClose} maxWidthClass="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-2.5 text-sm text-danger">{error}</div>}
        {noCategories && (
          <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-2.5 text-sm text-danger">
            No categories exist yet — an item cannot be created without one.{' '}
            <Link to="/inventory/categories" className="font-semibold underline underline-offset-2">Create a category first →</Link>
          </div>
        )}
        {noUnits && (
          <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-2.5 text-sm text-danger">
            No units exist yet — an item cannot be created without one.{' '}
            <Link to="/inventory/units" className="font-semibold underline underline-offset-2">Create a unit first →</Link>
          </div>
        )}
        <div>
          <label htmlFor="fi-name" className="mb-1.5 block text-xs font-semibold text-ink">Name *</label>
          <div className="relative">
            <TagIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input id="fi-name" type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Basmati Rice" className="w-full rounded-xl border border-border-strong/70 bg-white py-2.5 pl-10 pr-3.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />
          </div>
        </div>
        <div>
          <label htmlFor="fi-desc" className="mb-1.5 block text-xs font-semibold text-ink">Description</label>
          <div className="relative">
            <DescriptionIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input id="fi-desc" type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional notes about this item" className="w-full rounded-xl border border-border-strong/70 bg-white py-2.5 pl-10 pr-3.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="fi-cat" className="mb-1.5 block text-xs font-semibold text-ink">Category *</label>
            <div className="relative">
              <LayersIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <select id="fi-cat" required value={categoryName} onChange={(e) => setCategoryName(e.target.value)} disabled={mode === 'edit' || noCategories} className="w-full appearance-none rounded-xl border border-border-strong/70 bg-white py-2.5 pl-10 pr-3.5 text-sm outline-none focus:border-primary disabled:bg-background disabled:text-muted">
                <option value="">Select…</option>
                {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="fi-unit" className="mb-1.5 block text-xs font-semibold text-ink">Unit *</label>
            <div className="relative">
              <RulerIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <select id="fi-unit" required value={unitSymbol} onChange={(e) => setUnitSymbol(e.target.value)} disabled={mode === 'edit' || noUnits} className="w-full appearance-none rounded-xl border border-border-strong/70 bg-white py-2.5 pl-10 pr-3.5 text-sm outline-none focus:border-primary disabled:bg-background disabled:text-muted">
                <option value="">Select…</option>
                {units.map((u) => <option key={u.id} value={u.symbol}>{u.symbol} — {u.name}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="fi-min" className="mb-1.5 block text-xs font-semibold text-ink">Minimum stock</label>
            <div className="relative">
              <ArchiveIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input id="fi-min" type="number" min={0} step={1} value={minimumStock} onChange={(e) => setMinimumStock(e.target.value)} aria-describedby="fi-min-help" className="w-full rounded-xl border border-border-strong/70 bg-white py-2.5 pl-10 pr-3.5 text-sm outline-none focus:border-primary" />
            </div>
            <p id="fi-min-help" className="mt-1.5 text-[10px] leading-snug text-muted">Critical floor — stock at/below this is flagged CRITICAL.</p>
          </div>
          <div>
            <label htmlFor="fi-reorder" className="mb-1.5 block text-xs font-semibold text-ink">Reorder level</label>
            <div className="relative">
              <GaugeIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input id="fi-reorder" type="number" min={0} step={1} value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} aria-describedby="fi-reorder-help" className="w-full rounded-xl border border-border-strong/70 bg-white py-2.5 pl-10 pr-3.5 text-sm outline-none focus:border-primary" />
            </div>
            <p id="fi-reorder-help" className="mt-1.5 text-[10px] leading-snug text-muted">Warning point — reorder when stock hits this, <em>before</em> the minimum. Sets the LOW alert.</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-background">Cancel</button>
          <button type="submit" disabled={isSaving || noCategories || noUnits} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-70"><CheckIcon className="h-4 w-4" />{isSaving ? 'Saving…' : 'Save Item'}</button>
        </div>
      </form>
    </Modal>
  );
}
