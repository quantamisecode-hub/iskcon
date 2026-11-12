import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { createDish, fetchDishes, setDishStatus, updateDish } from '../features/events/api/events.api';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';
import type { DishItem } from '../features/events/types';
import { CheckIcon, DescriptionIcon, PencilIcon, PlusIcon, SearchIcon, TagIcon } from '../components/ui/icons';

const PAGE_SIZE = 12;

export function DishesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [page, setPage] = useState(1);
  const [dishes, setDishes] = useState<DishItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(searchParams.get('new') === '1');
  const [editing, setEditing] = useState<DishItem | null>(null);

  const filters = useMemo(
    () => ({
      search: search.trim() || undefined,
      isActive: statusFilter === 'all' ? undefined : statusFilter === 'active',
      page,
      pageSize: PAGE_SIZE,
    }),
    [search, statusFilter, page],
  );

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchDishes(filters)
      .then((result) => {
        if (cancelled) return;
        setDishes(result.dishes);
        setTotal(result.total);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
        setError(msg ?? 'Unable to load dishes.');
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
  }, [search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const reload = () => {
    fetchDishes(filters)
      .then((result) => {
        setDishes(result.dishes);
        setTotal(result.total);
      })
      .catch(() => undefined);
  };

  const toggleStatus = async (dish: DishItem) => {
    try {
      await setDishStatus(dish.id, !dish.isActive);
      setNotice(dish.isActive ? `“${dish.name}” deactivated.` : `“${dish.name}” activated.`);
      reload();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? 'Could not update dish status.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-primary">Dish Master</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Dishes</h1>
          <p className="mt-1 text-sm text-secondary">Reusable dishes for event planning. Only active dishes can be added to events.</p>
        </div>
        <button type="button" onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lift transition hover:bg-primary-dark">
          <PlusIcon className="h-4 w-4" />New Dish
        </button>
      </div>

      {notice && (
        <div role="status" className="rounded-xl border border-[#1e7a3c]/25 bg-[#e9f7ee] px-4 py-3 text-sm font-medium text-[#145c2c]">{notice}</div>
      )}
      {error && (
        <div role="alert" className="flex items-center justify-between gap-4 rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger">
          <span>{error}</span>
          <button type="button" onClick={reload} className="font-semibold underline underline-offset-2">Retry</button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-3">
        <div className="relative sm:col-span-2">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search dishes…"
            aria-label="Search dishes"
            className="w-full rounded-xl border border-border-strong/70 bg-white py-2.5 pl-10 pr-3.5 text-sm outline-none transition placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/25"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')} aria-label="Filter by status" className="rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}
        </div>
      ) : dishes.length === 0 && !error ? (
        <div className="rounded-2xl border border-dashed border-border-strong/70 bg-card p-12 text-center">
          <p className="text-base font-bold text-ink">No dishes found</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-secondary">{search ? 'Try a different search.' : 'Create your first dish to reuse it in events.'}</p>
          <button type="button" onClick={() => setShowCreate(true)} className="mt-5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-dark"><span className="inline-flex items-center gap-2"><PlusIcon className="h-4 w-4" />Create Dish</span></button>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background text-left text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">
                  <th className="px-4 py-3">Dish</th>
                  <th className="px-4 py-3 text-right">Materials</th>
                  <th className="px-4 py-3 text-right">Events</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {dishes.map((dish) => (
                  <tr key={dish.id} className="border-b border-border/60 transition last:border-0 hover:bg-background/60">
                    <td className="px-4 py-3 font-semibold text-ink">
                      <Link to={`/dishes/${dish.id}`} className="underline-offset-2 hover:text-primary hover:underline">{dish.name}</Link>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-secondary">{dish.materialsCount ?? 0}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-secondary">{dish.eventsCount ?? 0}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${dish.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>
                        {dish.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-secondary">{new Date(dish.createdAt).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button type="button" onClick={() => setEditing(dish)} className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong/60 px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-primary hover:text-primary"><PencilIcon className="h-3.5 w-3.5" />Edit</button>
                        <button type="button" onClick={() => void toggleStatus(dish)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${dish.isActive ? 'border border-danger/40 text-danger hover:bg-danger-soft' : 'border border-emerald-300 text-emerald-800 hover:bg-emerald-50'}`}>
                          {dish.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-secondary">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} dishes</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded-xl border border-border-strong/60 px-3 py-1.5 text-sm font-medium text-ink transition disabled:opacity-40">← Prev</button>
              <span className="px-2 text-xs font-semibold text-secondary">Page {page} of {totalPages}</span>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="rounded-xl border border-border-strong/60 px-3 py-1.5 text-sm font-medium text-ink transition disabled:opacity-40">Next →</button>
            </div>
          </div>
        </>
      )}

      {showCreate && (
        <DishFormModal
          mode="create"
          onClose={() => { setShowCreate(false); if (searchParams.has('new')) setSearchParams({}, { replace: true }); }}
          onSaved={(dish) => {
            setShowCreate(false);
            if (searchParams.has('new')) setSearchParams({}, { replace: true });
            setNotice(`Dish “${dish.name}” created.`);
            reload();
          }}
        />
      )}
      {editing && (
        <DishFormModal
          mode="edit"
          dish={editing}
          onClose={() => setEditing(null)}
          onSaved={(dish) => {
            setEditing(null);
            setNotice(`Dish “${dish.name}” updated.`);
            reload();
          }}
        />
      )}
    </div>
  );
}

function DishFormModal({
  mode,
  dish,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  dish?: DishItem;
  onClose: () => void;
  onSaved: (dish: DishItem) => void;
}) {
  const [name, setName] = useState(dish?.name ?? '');
  const [description, setDescription] = useState(dish?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Dish name is required.');
      return;
    }
    setIsSaving(true);
    try {
      const saved =
        mode === 'create'
          ? await createDish({ name: name.trim(), description: description.trim() || null })
          : await updateDish(dish!.id, { name: name.trim(), description: description.trim() || null });
      onSaved(saved);
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? 'Could not save the dish.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal title={mode === 'create' ? 'Create Dish' : 'Edit Dish'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-2.5 text-sm text-danger">{error}</div>}
        <div>
          <label htmlFor="dish-name" className="mb-1.5 block text-xs font-semibold text-ink">Dish name *</label>
          <div className="relative">
            <TagIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input id="dish-name" type="text" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kheer" className="w-full rounded-xl border border-border-strong/70 bg-white py-2.5 pl-10 pr-3.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />
          </div>
        </div>
        <div>
          <label htmlFor="dish-description" className="mb-1.5 block text-xs font-semibold text-ink">Description</label>
          <div className="relative">
            <DescriptionIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input id="dish-description" type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" className="w-full rounded-xl border border-border-strong/70 bg-white py-2.5 pl-10 pr-3.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-background">Cancel</button>
          <button type="submit" disabled={isSaving} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-dark disabled:opacity-70"><CheckIcon className="h-4 w-4" />{isSaving ? 'Saving…' : 'Save Dish'}</button>
        </div>
      </form>
    </Modal>
  );
}
