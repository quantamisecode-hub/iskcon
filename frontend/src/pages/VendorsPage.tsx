import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import {
  createVendor,
  deleteVendor,
  fetchVendor,
  fetchVendorAudit,
  fetchVendors,
  updateVendor,
  type VendorAuditEntry,
  type VendorPayload,
  type VendorRow,
} from '../features/inventory/api/inventory.api';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';
import { CheckIcon, ClockIcon, PencilIcon, PlusIcon, SearchIcon, TrashIcon } from '../components/ui/icons';
import { FieldLabel } from '../components/ui/FieldLabel';

/** Audit timestamps are always shown in India Standard Time, en-GB formatting. */
const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

/** Audit action codes are rendered as plain language, never as raw keys. */
const AUDIT_ACTION_LABELS: Record<string, string> = {
  CREATE_VENDOR: 'Vendor created',
  UPDATE_VENDOR: 'Vendor updated',
  ACTIVATE_VENDOR: 'Vendor activated',
  DEACTIVATE_VENDOR: 'Vendor deactivated',
  DELETE_VENDOR: 'Vendor deleted',
};

const AUDIT_FIELD_LABELS: Record<string, string> = {
  id: 'ID',
  name: 'Name',
  contactPerson: 'Contact person',
  phone: 'Phone',
  email: 'Email',
  address: 'Address',
  city: 'City',
  state: 'State',
  gstNumber: 'GST number',
  paymentTerms: 'Payment terms',
  notes: 'Notes',
  isActive: 'Status',
  createdAt: 'Created',
  updatedAt: 'Last updated',
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** Booleans and ISO dates get a meaning; unsupported nested values are never dumped as JSON. */
const formatAuditValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Active' : 'Inactive';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    return /^\d{4}-\d{2}-\d{2}T/.test(value) ? formatDateTime(value) : value;
  }
  return '—';
};

/** One readable "Field: before → after" line per changed field. */
const describeAuditChanges = (
  entry: VendorAuditEntry,
): Array<{ label: string; before: string; after: string }> => {
  const before = asRecord(entry.oldValues) ?? {};
  const after = asRecord(entry.newValues) ?? {};
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).filter(
    (key) =>
      key !== 'id' &&
      key !== 'updatedAt' &&
      formatAuditValue(before[key]) !== formatAuditValue(after[key]),
  );
  return keys.map((key) => ({
    label: AUDIT_FIELD_LABELS[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2'),
    before: formatAuditValue(before[key]),
    after: formatAuditValue(after[key]),
  }));
};

/** Server-provided message only; never surface raw network/server internals. */
const extractMessage = (err: unknown) =>
  (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;

export function VendorsPage() {
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [page, setPage] = useState(1);
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<VendorRow | null>(null);
  const [deleting, setDeleting] = useState<VendorRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [detailVendor, setDetailVendor] = useState<VendorRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [auditVendor, setAuditVendor] = useState<VendorRow | null>(null);
  const [auditEntries, setAuditEntries] = useState<VendorAuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  const PAGE_SIZE = 20;
  const filters = useMemo(
    () => ({ search: search.trim() || undefined, isActive: statusFilter === 'all' ? undefined : statusFilter === 'active', page, pageSize: PAGE_SIZE }),
    [search, statusFilter, page],
  );

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchVendors(filters)
      .then((r) => { if (!cancelled) { setVendors(r.vendors); setTotal(r.total); } })
      .catch(() => { if (!cancelled) setError('Unable to load vendors.'); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [filters]);

  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const reload = () => fetchVendors(filters).then((r) => { setVendors(r.vendors); setTotal(r.total); }).catch(() => undefined);

  // Route-aware behaviour: the list page also serves /vendors/new, /vendors/:id
  // and /vendors/:id/edit. Every one of those URLs is ADMIN-guarded in App.tsx.
  useEffect(() => {
    let cancelled = false;
    const path = location.pathname;

    // A single page component serves all four routes — never leave a modal
    // from the previous route stacked on top of the new one.
    setDetailVendor(null);
    setDetailLoading(false);
    setAuditVendor(null);
    setEditing(null);
    setShowCreate(false);

    if (path === '/vendors/new') {
      setShowCreate(true);
      return () => { cancelled = true; };
    }

    if (id && path.endsWith('/edit')) {
      fetchVendor(id)
        .then((vendor) => { if (!cancelled) setEditing(vendor); })
        .catch((err) => { if (!cancelled) setError(extractMessage(err) ?? 'Unable to load vendor.'); });
      return () => { cancelled = true; };
    }

    if (id) {
      setDetailVendor(null);
      setDetailLoading(true);
      fetchVendor(id)
        .then((vendor) => { if (!cancelled) setDetailVendor(vendor); })
        .catch((err) => { if (!cancelled) setError(extractMessage(err) ?? 'Unable to load vendor.'); })
        .finally(() => { if (!cancelled) setDetailLoading(false); });
    }

    return () => { cancelled = true; };
  }, [location.pathname, id]);

  const openAudit = (vendor: VendorRow) => {
    setAuditVendor(vendor);
    setAuditEntries([]);
    setAuditError(null);
    setAuditLoading(true);
    fetchVendorAudit(vendor.id)
      .then((entries) => setAuditEntries(entries))
      .catch((err) => setAuditError(extractMessage(err) ?? 'Unable to load vendor history.'))
      .finally(() => setAuditLoading(false));
  };

  const toggle = async (vendor: VendorRow) => {
    setError(null);
    try {
      await updateVendor(vendor.id, { isActive: !vendor.isActive });
      setNotice(`“${vendor.name}” ${vendor.isActive ? 'deactivated' : 'activated'}.`);
      reload();
    } catch (err) {
      setError(extractMessage(err) ?? 'Could not update vendor.');
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteVendor(deleting.id);
      setNotice(`“${deleting.name}” deleted.`);
      setDeleting(null);
      setDeleteError(null);
      reload();
    } catch (err) {
      // Show the reason inline inside the dialog; keep the page clean.
      setDeleteError(extractMessage(err) ?? 'Could not delete vendor.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-primary">Inventory</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Vendors</h1>
          <p className="mt-1 text-sm text-secondary">Suppliers credited on stock-in. Deactivate to hide temporarily, or delete permanently.</p>
        </div>
        <button type="button" onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lift transition hover:bg-primary-dark"><PlusIcon className="h-4 w-4" />New Vendor</button>
      </div>

      {notice && <div role="status" className="rounded-xl border border-[#1e7a3c]/25 bg-[#e9f7ee] px-4 py-3 text-sm font-medium text-[#145c2c]">{notice}</div>}
      {error && <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-3">
        <div className="relative sm:col-span-2">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vendors…" aria-label="Search vendors" className="w-full rounded-xl border border-border-strong/70 bg-white py-2.5 pl-10 pr-3.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />
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
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((vendor) => (
                  <tr key={vendor.id} className="border-b border-border/60 last:border-0 hover:bg-background/60">
                    <td className="px-4 py-3 font-semibold text-ink">
                      {vendor.name}
                      {vendor.gstNumber && <span className="mt-0.5 block text-[10px] font-medium text-muted">GST: {vendor.gstNumber}</span>}
                    </td>
                    <td className="px-4 py-3 text-secondary">{vendor.contactPerson ?? '—'}</td>
                    <td className="px-4 py-3 tabular-nums text-secondary">{vendor.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-secondary">{vendor.email ?? '—'}</td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${vendor.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>{vendor.isActive ? 'Active' : 'Inactive'}</span></td>
                    <td className="px-4 py-3 text-xs tabular-nums text-muted">{new Date(vendor.createdAt).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => openAudit(vendor)} title="View vendor history" className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong/60 px-3 py-1.5 text-xs font-semibold text-ink hover:border-primary hover:text-primary"><ClockIcon className="h-3.5 w-3.5" />History</button>
                        <button type="button" onClick={() => setEditing(vendor)} className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong/60 px-3 py-1.5 text-xs font-semibold text-ink hover:border-primary hover:text-primary"><PencilIcon className="h-3.5 w-3.5" />Edit</button>
                        <button type="button" onClick={() => void toggle(vendor)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${vendor.isActive ? 'text-danger hover:bg-danger-soft' : 'text-emerald-800 hover:bg-emerald-50'} border ${vendor.isActive ? 'border-danger/40' : 'border-emerald-300'}`}>{vendor.isActive ? 'Deactivate' : 'Activate'}</button>
                        <button type="button" onClick={() => { setDeleteError(null); setDeleting(vendor); }} aria-label={`Delete ${vendor.name}`} title="Delete vendor permanently" className="rounded-lg border border-danger/40 p-1.5 text-danger transition hover:bg-danger-soft">
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {vendors.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-secondary">No vendors found.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-secondary">{total} vendors</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded-xl border border-border-strong/60 px-3 py-1.5 text-sm font-medium disabled:opacity-40">← Prev</button>
              <span className="px-2 text-xs font-semibold tabular-nums text-secondary">Page {page} of {totalPages}</span>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="rounded-xl border border-border-strong/60 px-3 py-1.5 text-sm font-medium disabled:opacity-40">Next →</button>
            </div>
          </div>
        </>
      )}

      {showCreate && <VendorFormModal mode="create" onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); reload(); }} />}
      {editing && <VendorFormModal mode="edit" vendor={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      {deleting && (
        <DeleteVendorDialog
          vendor={deleting}
          isBusy={isDeleting}
          error={deleteError}
          onClose={() => { setDeleting(null); setDeleteError(null); }}
          onConfirm={() => void confirmDelete()}
        />
      )}
      {(detailLoading || detailVendor) && (
        <VendorDetailModal vendor={detailVendor} loading={detailLoading} onClose={() => setDetailVendor(null)} />
      )}
      {auditVendor && (
        <VendorAuditModal
          vendor={auditVendor}
          entries={auditEntries}
          loading={auditLoading}
          error={auditError}
          onClose={() => setAuditVendor(null)}
        />
      )}
    </div>
  );
}

function DeleteVendorDialog({ vendor, isBusy, error, onClose, onConfirm }: { vendor: VendorRow; isBusy: boolean; error: string | null; onClose: () => void; onConfirm: () => void }) {
  return (
    <Modal title="Delete Vendor?" onClose={onClose} maxWidthClass="max-w-md">
      <p className="text-sm leading-relaxed text-secondary">
        <strong className="text-ink">{vendor.name}</strong> will be <strong className="text-danger">permanently deleted</strong> from the database. This cannot be undone.
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">Stock-in and ledger records are kept, but they will no longer show this vendor's name.</p>
      {error && <p role="alert" className="mt-3 rounded-xl border border-danger/25 bg-danger-soft px-4 py-2.5 text-sm font-semibold text-danger">{error}</p>}
      <div className="mt-5 flex items-center justify-end gap-3">
        <button type="button" onClick={onClose} className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-background">Cancel</button>
        <button type="button" disabled={isBusy} onClick={onConfirm} className="inline-flex items-center gap-2 rounded-xl bg-danger px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"><TrashIcon className="h-4 w-4" />{isBusy ? 'Deleting…' : 'Delete'}</button>
      </div>
    </Modal>
  );
}

function DetailField({ label, value, multiline = false }: { label: string; value: string | null; multiline?: boolean }) {
  return (
    <div>
      <FieldLabel className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</FieldLabel>
      <p className={`text-sm text-ink ${multiline ? 'whitespace-pre-wrap' : ''}`}>{value || '—'}</p>
    </div>
  );
}

/** Read-only view for /vendors/:id — every persisted vendor field. */
function VendorDetailModal({ vendor, loading, onClose }: { vendor: VendorRow | null; loading: boolean; onClose: () => void }) {
  return (
    <Modal title="Vendor Details" onClose={onClose} maxWidthClass="max-w-xl">
      {loading || !vendor ? (
        <div className="space-y-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 rounded-xl" />)}</div>
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <DetailField label="Name" value={vendor.name} />
          <DetailField label="Status" value={vendor.isActive ? 'Active' : 'Inactive'} />
          <DetailField label="Contact Person" value={vendor.contactPerson} />
          <DetailField label="Phone" value={vendor.phone} />
          <DetailField label="Email" value={vendor.email} />
          <DetailField label="GST Number" value={vendor.gstNumber} />
          <DetailField label="Address" value={vendor.address} />
          <DetailField label="City" value={vendor.city} />
          <DetailField label="State" value={vendor.state} />
          <DetailField label="Payment Terms" value={vendor.paymentTerms} />
          <div className="sm:col-span-2"><DetailField label="Notes" value={vendor.notes} multiline /></div>
          <DetailField label="Created" value={formatDateTime(vendor.createdAt)} />
          <DetailField label="Last Updated" value={formatDateTime(vendor.updatedAt)} />
        </div>
      )}
      <div className="mt-5 flex justify-end">
        <button type="button" onClick={onClose} className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-background">Close</button>
      </div>
    </Modal>
  );
}

/** ADMIN-only audit history for a single vendor (backend independently enforces 403). */
function VendorAuditModal({ vendor, entries, loading, error, onClose }: { vendor: VendorRow; entries: VendorAuditEntry[]; loading: boolean; error: string | null; onClose: () => void }) {
  return (
    <Modal title={`History — ${vendor.name}`} onClose={onClose} maxWidthClass="max-w-2xl">
      {error && <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-2.5 text-sm text-danger">{error}</div>}
      {loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-secondary">No history recorded for this vendor.</p>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const changes = describeAuditChanges(entry);
            const actionLabel = AUDIT_ACTION_LABELS[entry.action] ?? entry.action.replace(/_/g, ' ').toLowerCase();
            return (
              <div key={entry.id} className="rounded-xl border border-border bg-background/60 p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="inline-flex rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">{actionLabel}</span>
                  <span className="text-[11px] tabular-nums text-muted">{formatDateTime(entry.createdAt)}</span>
                </div>
                <p className="mt-2 text-xs text-secondary">Actor: <span className="font-semibold text-ink">{entry.actorName ?? 'System'}</span></p>
                <div className="mt-2 rounded-lg border border-border bg-card p-2.5">
                  {changes.length === 0 ? (
                    <p className="text-xs text-secondary">No field changes recorded.</p>
                  ) : (
                    <dl className="space-y-1.5">
                      {changes.map((change) => {
                        const detail =
                          change.before === '—'
                            ? `Set to ${change.after}`
                            : change.after === '—'
                              ? `Was ${change.before}`
                              : `${change.before} → ${change.after}`;
                        return (
                          <div key={change.label} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                            <dt className="font-semibold text-ink">{change.label}:</dt>
                            <dd className="text-secondary">{detail}</dd>
                          </div>
                        );
                      })}
                    </dl>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-5 flex justify-end">
        <button type="button" onClick={onClose} className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-background">Close</button>
      </div>
    </Modal>
  );
}

interface VendorFormState {
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  gstNumber: string;
  paymentTerms: string;
  notes: string;
  isActive: boolean;
}

function VendorFormModal({ mode, vendor, onClose, onSaved }: { mode: 'create' | 'edit'; vendor?: VendorRow; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<VendorFormState>(() => ({
    name: vendor?.name ?? '',
    contactPerson: vendor?.contactPerson ?? '',
    phone: vendor?.phone ?? '',
    email: vendor?.email ?? '',
    address: vendor?.address ?? '',
    city: vendor?.city ?? '',
    state: vendor?.state ?? '',
    gstNumber: vendor?.gstNumber ?? '',
    paymentTerms: vendor?.paymentTerms ?? '',
    notes: vendor?.notes ?? '',
    isActive: vendor?.isActive ?? true,
  }));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const set = <K extends keyof VendorFormState>(key: K, value: VendorFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setIsSaving(true);
    const payload: VendorPayload = {
      name: form.name.trim(),
      contactPerson: form.contactPerson.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      gstNumber: form.gstNumber.trim() || null,
      paymentTerms: form.paymentTerms.trim() || null,
      notes: form.notes.trim() || null,
      isActive: form.isActive,
    };
    try {
      if (mode === 'create') await createVendor(payload);
      else await updateVendor(vendor!.id, payload);
      onSaved();
    } catch (err) {
      setError(extractMessage(err) ?? 'Could not save the vendor.');
    } finally { setIsSaving(false); }
  };

  return (
    <Modal title={mode === 'create' ? 'Create Vendor' : 'Edit Vendor'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-2.5 text-sm text-danger">{error}</div>}
        <div>
          <FieldLabel htmlFor="vendor-name" className="mb-1.5 block text-xs font-semibold text-ink">Name *</FieldLabel>
          <input id="vendor-name" type="text" required autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Sri Krishna Supplies" className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="vendor-contact" label="Contact Person" value={form.contactPerson} onChange={(v) => set('contactPerson', v)} placeholder="Optional" />
          <Field id="vendor-phone" label="Phone" value={form.phone} onChange={(v) => set('phone', v)} placeholder="Optional" />
          <Field id="vendor-email" label="Email" type="email" value={form.email} onChange={(v) => set('email', v)} placeholder="Optional" />
          <Field id="vendor-gst" label="GST Number" value={form.gstNumber} onChange={(v) => set('gstNumber', v)} placeholder="Optional" />
          <Field id="vendor-city" label="City" value={form.city} onChange={(v) => set('city', v)} placeholder="Optional" />
          <Field id="vendor-state" label="State" value={form.state} onChange={(v) => set('state', v)} placeholder="Optional" />
        </div>
        <Field id="vendor-address" label="Address" value={form.address} onChange={(v) => set('address', v)} placeholder="Optional" />
        <Field id="vendor-terms" label="Payment Terms" value={form.paymentTerms} onChange={(v) => set('paymentTerms', v)} placeholder="e.g. Net 30, advance, COD" />
        <div>
          <FieldLabel htmlFor="vendor-notes" className="mb-1.5 block text-xs font-semibold text-ink">Notes</FieldLabel>
          <textarea id="vendor-notes" rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Optional" className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />
        </div>
        <label className="flex items-center gap-2.5 text-sm font-semibold text-ink">
          <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} className="h-4 w-4 rounded border-border-strong text-primary focus:ring-primary" />
          Active vendor
          <span className="text-xs font-normal text-muted">— active vendors appear in the Stock In form.</span>
        </label>
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-background">Cancel</button>
          <button type="submit" disabled={isSaving} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-dark disabled:opacity-70"><CheckIcon className="h-4 w-4" />{isSaving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ id, label, value, onChange, placeholder, type = 'text' }: { id: string; label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <FieldLabel htmlFor={id} className="mb-1.5 block text-xs font-semibold text-ink">{label}</FieldLabel>
      <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />
    </div>
  );
}
