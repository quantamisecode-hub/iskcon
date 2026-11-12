import { useEffect, useMemo, useState } from 'react';
import { createUnit, fetchUnitsList, updateUnit, type UnitRow } from '../features/inventory/api/inventory.api';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';

const UNIT_TYPES = ['WEIGHT', 'VOLUME', 'COUNT', 'OTHER'] as const;

export function UnitsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<UnitRow | null>(null);

  const PAGE_SIZE = 20;
  const filters = useMemo(() => ({ search: search.trim() || undefined, page, pageSize: PAGE_SIZE }), [search, page]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchUnitsList(filters)
      .then((r) => { if (!cancelled) { setUnits(r.units); setTotal(r.total); } })
      .catch(() => { if (!cancelled) setError('Unable to load units.'); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [filters]);

  useEffect(() => { setPage(1); }, [search]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const reload = () => fetchUnitsList(filters).then((r) => { setUnits(r.units); setTotal(r.total); }).catch(() => undefined);

  const toggle = async (unit: UnitRow) => {
    try {
      await updateUnit(unit.id, { isActive: unit.isActive ? 'false' : 'true' });
      setNotice(unit.isActive ? `“${unit.symbol}” deactivated.` : `“${unit.symbol}” activated.`);
      reload();
    } catch {
      setError('Could not update unit.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-primary">Inventory</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Units</h1>
          <p className="mt-1 text-sm text-secondary">Measurement units used by the food item master.</p>
        </div>
        <button type="button" onClick={() => setShowCreate(true)} className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lift transition hover:bg-primary-dark">+ New Unit</button>
      </div>

      {notice && <div role="status" className="rounded-xl border border-[#1e7a3c]/25 bg-[#e9f7ee] px-4 py-3 text-sm font-medium text-[#145c2c]">{notice}</div>}
      {error && <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

      <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search units…" aria-label="Search units" className="w-full rounded-xl border border-border-strong/70 bg-card px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-2xl" />)}</div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background text-left text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Symbol</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {units.map((unit) => (
                  <tr key={unit.id} className="border-b border-border/60 last:border-0 hover:bg-background/60">
                    <td className="px-4 py-3 font-semibold text-ink">{unit.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-secondary">{unit.symbol}</td>
                    <td className="px-4 py-3 text-secondary">{unit.unitType}</td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${unit.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>{unit.isActive ? 'Active' : 'Inactive'}</span></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setEditing(unit)} className="rounded-lg border border-border-strong/60 px-3 py-1.5 text-xs font-semibold text-ink hover:border-primary hover:text-primary">Edit</button>
                        <button type="button" onClick={() => void toggle(unit)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${unit.isActive ? 'border-danger/40 text-danger hover:bg-danger-soft' : 'border-emerald-300 text-emerald-800 hover:bg-emerald-50'}`}>{unit.isActive ? 'Deactivate' : 'Activate'}</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {units.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-secondary">No units found.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-secondary">{total} units</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded-xl border border-border-strong/60 px-3 py-1.5 text-sm font-medium disabled:opacity-40">← Prev</button>
              <span className="px-2 text-xs font-semibold tabular-nums text-secondary">Page {page} of {totalPages}</span>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="rounded-xl border border-border-strong/60 px-3 py-1.5 text-sm font-medium disabled:opacity-40">Next →</button>
            </div>
          </div>
        </>
      )}

      {showCreate && <UnitFormModal mode="create" onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); reload(); }} />}
      {editing && <UnitFormModal mode="edit" unit={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}

function UnitFormModal({ mode, unit, onClose, onSaved }: { mode: 'create' | 'edit'; unit?: UnitRow; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(unit?.name ?? '');
  const [symbol, setSymbol] = useState(unit?.symbol ?? '');
  const [unitType, setUnitType] = useState(unit?.unitType ?? 'WEIGHT');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !symbol.trim()) { setError('Name and symbol are required.'); return; }
    setIsSaving(true);
    try {
      if (mode === 'create') await createUnit({ name: name.trim(), symbol: symbol.trim().toUpperCase(), unitType });
      else await updateUnit(unit!.id, { name: name.trim(), symbol: symbol.trim().toUpperCase(), unitType });
      onSaved();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? 'Could not save the unit.');
    } finally { setIsSaving(false); }
  };

  return (
    <Modal title={mode === 'create' ? 'Create Unit' : 'Edit Unit'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-2.5 text-sm text-danger">{error}</div>}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="unit-name" className="mb-1.5 block text-xs font-semibold text-ink">Name *</label>
            <input id="unit-name" type="text" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kilogram" className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary" />
          </div>
          <div>
            <label htmlFor="unit-symbol" className="mb-1.5 block text-xs font-semibold text-ink">Symbol *</label>
            <input id="unit-symbol" type="text" required value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="e.g. KG" className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm uppercase outline-none focus:border-primary" />
          </div>
        </div>
        <div>
          <label htmlFor="unit-type" className="mb-1.5 block text-xs font-semibold text-ink">Type</label>
          <select id="unit-type" value={unitType} onChange={(e) => setUnitType(e.target.value)} className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary">
            {UNIT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </div>
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-background">Cancel</button>
          <button type="submit" disabled={isSaving} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-dark disabled:opacity-70">{isSaving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}
