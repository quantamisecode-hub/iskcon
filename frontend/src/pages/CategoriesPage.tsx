import { useEffect, useMemo, useState } from 'react';
import { createCategory, deleteCategory, fetchCategories, updateCategory, type CategoryRow } from '../features/inventory/api/inventory.api';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';
import { CheckIcon, DescriptionIcon, PencilIcon, PlusIcon, SearchIcon, TagIcon, TrashIcon } from '../components/ui/icons';

export function CategoriesPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [page, setPage] = useState(1);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [deleting, setDeleting] = useState<CategoryRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const PAGE_SIZE = 20;
  const filters = useMemo(
    () => ({ search: search.trim() || undefined, isActive: statusFilter === 'all' ? undefined : statusFilter === 'active', page, pageSize: PAGE_SIZE }),
    [search, statusFilter, page],
  );

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchCategories(filters)
      .then((r) => { if (!cancelled) { setCategories(r.categories); setTotal(r.total); } })
      .catch(() => { if (!cancelled) setError('Unable to load categories.'); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [filters]);

  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const reload = () => fetchCategories(filters).then((r) => { setCategories(r.categories); setTotal(r.total); }).catch(() => undefined);

  const extractMessage = (err: unknown) =>
    (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;

  const toggle = async (category: CategoryRow) => {
    setError(null);
    try {
      await updateCategory(category.id, { isActive: category.isActive ? 'false' : 'true' });
      setNotice(category.isActive ? `“${category.name}” deactivated.` : `“${category.name}” activated.`);
      reload();
    } catch (err) {
      setError(extractMessage(err) ?? 'Could not update category.');
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteCategory(deleting.id);
      setNotice(`“${deleting.name}” deleted.`);
      setDeleting(null);
      setDeleteError(null);
      reload();
    } catch (err) {
      // Show the reason inline inside the dialog; keep the page clean.
      setDeleteError(extractMessage(err) ?? 'Could not delete category.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-primary">Inventory</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Categories</h1>
          <p className="mt-1 text-sm text-secondary">Food categories for the item master.</p>
        </div>
        <button type="button" onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lift transition hover:bg-primary-dark"><PlusIcon className="h-4 w-4" />New Category</button>
      </div>

      {notice && <div role="status" className="rounded-xl border border-[#1e7a3c]/25 bg-[#e9f7ee] px-4 py-3 text-sm font-medium text-[#145c2c]">{notice}</div>}
      {error && <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-3">
        <div className="relative sm:col-span-2">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search categories…" aria-label="Search categories" className="w-full rounded-xl border border-border-strong/70 bg-white py-2.5 pl-10 pr-3.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')} aria-label="Filter by status" className="rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-2xl" />)}</div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background text-left text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category.id} className="border-b border-border/60 last:border-0 hover:bg-background/60">
                    <td className="px-4 py-3 font-semibold text-ink">{category.name}</td>
                    <td className="px-4 py-3 text-secondary">{category.description ?? '—'}</td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${category.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>{category.isActive ? 'Active' : 'Inactive'}</span></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setEditing(category)} className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong/60 px-3 py-1.5 text-xs font-semibold text-ink hover:border-primary hover:text-primary"><PencilIcon className="h-3.5 w-3.5" />Edit</button>
                        <button type="button" onClick={() => void toggle(category)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${category.isActive ? 'text-danger hover:bg-danger-soft' : 'text-emerald-800 hover:bg-emerald-50'} border ${category.isActive ? 'border-danger/40' : 'border-emerald-300'}`}>{category.isActive ? 'Deactivate' : 'Activate'}</button>
                        <button type="button" onClick={() => { setDeleteError(null); setDeleting(category); }} aria-label={`Delete ${category.name}`} title="Delete category" className="rounded-lg border border-danger/40 p-1.5 text-danger transition hover:bg-danger-soft">
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {categories.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-secondary">No categories found.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-secondary">{total} categories</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded-xl border border-border-strong/60 px-3 py-1.5 text-sm font-medium disabled:opacity-40">← Prev</button>
              <span className="px-2 text-xs font-semibold tabular-nums text-secondary">Page {page} of {totalPages}</span>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="rounded-xl border border-border-strong/60 px-3 py-1.5 text-sm font-medium disabled:opacity-40">Next →</button>
            </div>
          </div>
        </>
      )}

      {showCreate && <CategoryFormModal mode="create" onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); reload(); }} />}
      {editing && <CategoryFormModal mode="edit" category={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      {deleting && (
        <DeleteCategoryDialog
          category={deleting}
          isBusy={isDeleting}
          error={deleteError}
          onClose={() => { setDeleting(null); setDeleteError(null); }}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </div>
  );
}

function DeleteCategoryDialog({ category, isBusy, error, onClose, onConfirm }: { category: CategoryRow; isBusy: boolean; error: string | null; onClose: () => void; onConfirm: () => void }) {
  return (
    <Modal title="Delete Category?" onClose={onClose} maxWidthClass="max-w-md">
      <p className="text-sm leading-relaxed text-secondary">
        <strong className="text-ink">{category.name}</strong> is about to be <strong className="text-danger">permanently deleted</strong>. This can't be undone. Food items still using this category must be moved to another category first.
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">Want to keep it for later? Deactivate instead — it hides from the item form without deleting anything.</p>
      {error && <p role="alert" className="mt-3 rounded-xl border border-danger/25 bg-danger-soft px-4 py-2.5 text-sm font-semibold text-danger">{error}</p>}
      <div className="mt-5 flex items-center justify-end gap-3">
        <button type="button" onClick={onClose} className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-background">Cancel</button>
        <button type="button" disabled={isBusy} onClick={onConfirm} className="inline-flex items-center gap-2 rounded-xl bg-danger px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"><TrashIcon className="h-4 w-4" />{isBusy ? 'Deleting…' : 'Delete'}</button>
      </div>
    </Modal>
  );
}

function CategoryFormModal({ mode, category, onClose, onSaved }: { mode: 'create' | 'edit'; category?: CategoryRow; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(category?.name ?? '');
  const [description, setDescription] = useState(category?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('Name is required.'); return; }
    setIsSaving(true);
    try {
      if (mode === 'create') await createCategory({ name: name.trim(), description: description.trim() || undefined });
      else await updateCategory(category!.id, { name: name.trim(), description: description.trim() || undefined });
      onSaved();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? 'Could not save the category.');
    } finally { setIsSaving(false); }
  };

  return (
    <Modal title={mode === 'create' ? 'Create Category' : 'Edit Category'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-2.5 text-sm text-danger">{error}</div>}
        <div>
          <label htmlFor="cat-name" className="mb-1.5 block text-xs font-semibold text-ink">Name *</label>
          <div className="relative">
            <TagIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input id="cat-name" type="text" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rice & Grains" className="w-full rounded-xl border border-border-strong/70 bg-white py-2.5 pl-10 pr-3.5 text-sm outline-none focus:border-primary" />
          </div>
        </div>
        <div>
          <label htmlFor="cat-desc" className="mb-1.5 block text-xs font-semibold text-ink">Description</label>
          <div className="relative">
            <DescriptionIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input id="cat-desc" type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" className="w-full rounded-xl border border-border-strong/70 bg-white py-2.5 pl-10 pr-3.5 text-sm outline-none focus:border-primary" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-background">Cancel</button>
          <button type="submit" disabled={isSaving} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-dark disabled:opacity-70"><CheckIcon className="h-4 w-4" />{isSaving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}
