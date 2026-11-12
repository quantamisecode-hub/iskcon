import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { fetchLedger, fetchFoodItemsList, fetchLedgerEntry, type LedgerRow } from '../features/inventory/api/inventory.api';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';

const TYPE_OPTIONS = ['', 'STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'RETURN'] as const;
const PAGE_SIZE = 25;

const REFERENCE_KIND: Record<string, string> = {
  MATERIAL_REQUEST_ISSUE: 'Issue',
  MATERIAL_REQUEST: 'Request',
  MATERIAL_RETURN: 'Return',
  EVENT: 'Event',
};

const humanize = (value: string) =>
  value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());

/**
 * Meaningful view of a ledger reference: a human code (REQ-…/RET-…/EV-…),
 * never a raw UUID. `to` is the deep link — null until that route exists.
 */
function referenceInfo(row: LedgerRow): { kind: string | null; label: string | null; to: string | null } {
  const type = row.referenceType;
  if (!type || !row.referenceLabel) return { kind: null, label: null, to: null };
  const to =
    type === 'MATERIAL_REQUEST_ISSUE' || type === 'MATERIAL_REQUEST'
      ? `/requests/${row.referenceId}`
      : type === 'MATERIAL_RETURN'
        ? `/returns/${row.referenceId}`
        : type === 'EVENT'
          ? `/events/${row.referenceId}`
          : null;
  return { kind: REFERENCE_KIND[type] ?? humanize(type), label: row.referenceLabel, to };
}

function ReferenceCell({ row }: { row: LedgerRow }) {
  const { kind, label, to } = referenceInfo(row);
  const showRemarks = Boolean(label && row.remarks && !row.remarks.includes(label));
  const primary = label ? (
    <span className="font-medium text-ink">
      {kind ? `${kind} · ` : ''}
      {to ? (
        <Link
          to={to}
          onClick={(e) => e.stopPropagation()}
          className="text-primary hover:underline"
        >
          {label}
        </Link>
      ) : (
        label
      )}
    </span>
  ) : row.referenceType ? (
    <span>{humanize(row.referenceType)}</span>
  ) : row.remarks ? (
    <span>{row.remarks}</span>
  ) : (
    <span className="text-muted">—</span>
  );
  return (
    <span className="block">
      {primary}
      {showRemarks && <span className="block text-[11px] text-muted">{row.remarks}</span>}
    </span>
  );
}

/** Modal version — same human label, linked, with no raw UUID anywhere. */
function ReferenceDetail({ row }: { row: LedgerRow }) {
  const { kind, label, to } = referenceInfo(row);
  if (!label) {
    return <span>{row.referenceType ? humanize(row.referenceType) : row.remarks ?? '—'}</span>;
  }
  const text = `${kind ? `${kind} · ` : ''}${label}`;
  return to ? (
    <Link to={to} className="text-primary hover:underline">{text}</Link>
  ) : (
    <span>{text}</span>
  );
}

export function LedgerPage() {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [type, setType] = useState('');
  const [itemId, setItemId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [selected, setSelected] = useState<LedgerRow | null>(null);
  const [detail, setDetail] = useState<LedgerRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const filters = useMemo(
    () => ({ type: type || undefined, itemId: itemId || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, page, pageSize: PAGE_SIZE }),
    [type, itemId, dateFrom, dateTo, page],
  );

  useEffect(() => {
    fetchFoodItemsList({ pageSize: 100 }).then((r) => setItems(r.foodItems.map((f) => ({ id: f.id, name: f.name })))).catch(() => setItems([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchLedger(filters)
      .then((r) => { if (!cancelled) { setRows(r.transactions); setTotal(r.total); } })
      .catch(() => { if (!cancelled) setError('Unable to load the ledger. This is usually a quick hiccup — please try again.'); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [filters, retryTick]);

  useEffect(() => { setPage(1); }, [type, itemId, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-primary">Inventory</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Stock Ledger</h1>
        <p className="mt-1 text-sm text-secondary">Every balance change, in one place. Written only by stock operations.</p>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger">
          <span>{error}</span>
          <button type="button" onClick={() => setRetryTick((t) => t + 1)} className="flex-none rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-danger transition hover:bg-red-100">Retry</button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-4 md:grid-cols-5">
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Transaction type" className="rounded-xl border border-border-strong/70 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary">
          {TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option === '' ? 'All types' : option.replace('_', ' ')}</option>)}
        </select>
        <select value={itemId} onChange={(e) => setItemId(e.target.value)} aria-label="Food item" className="rounded-xl border border-border-strong/70 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary">
          <option value="">All items</option>
          {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="From date" className="rounded-xl border border-border-strong/70 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary" />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="To date" className="rounded-xl border border-border-strong/70 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary" />
        <button type="button" onClick={() => { setType(''); setItemId(''); setDateFrom(''); setDateTo(''); }} className="rounded-xl border border-border-strong/60 px-3 py-2.5 text-xs font-semibold text-ink transition hover:border-primary hover:text-primary">Clear filters</button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-2xl" />)}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-strong/70 bg-card p-12 text-center">
          <p className="text-base font-bold text-ink">No transactions</p>
          <p className="mt-1 text-sm text-secondary">Nothing matched these filters yet. Stock operations will appear here.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border bg-background text-left text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">By</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isIn = row.transactionType === 'STOCK_IN' || row.transactionType === 'RETURN';
                  return (
                    <tr key={row.id} className="cursor-pointer border-b border-border/60 transition last:border-0 hover:bg-background/60" onClick={() => { setSelected(row); setDetail(null); setDetailLoading(true); void fetchLedgerEntry(row.id).then(setDetail).catch(() => setDetail(row)).finally(() => setDetailLoading(false)); }}>
                      <td className="px-4 py-3 text-xs text-secondary whitespace-nowrap">{new Date(row.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="px-4 py-3 font-medium text-ink">
                        {row.foodItemId ? <Link to={`/inventory/food-items/${row.foodItemId}`} onClick={(e) => e.stopPropagation()} className="hover:text-primary hover:underline">{row.item}</Link> : row.item}
                      </td>
                      <td className="px-4 py-3"><span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-secondary">{row.transactionType.replace('_', ' ')}</span></td>
                      <td className={`px-4 py-3 text-right font-bold tabular-nums ${isIn ? 'text-emerald-700' : row.transactionType === 'STOCK_OUT' ? 'text-red-700' : 'text-secondary'}`}>{isIn ? '+' : row.transactionType === 'STOCK_OUT' ? '−' : '±'}{Math.abs(row.quantity)} {row.unit}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-secondary">{row.balanceBefore} → {row.balanceAfter}</td>
                      <td className="px-4 py-3 text-xs text-secondary"><ReferenceCell row={row} /></td>
                      <td className="px-4 py-3 text-xs text-secondary">{row.performedBy}</td>
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

      {selected && (
        <Modal title="Transaction Detail" onClose={() => setSelected(null)} maxWidthClass="max-w-md">
          {detailLoading || !detail ? (
            <p className="text-sm text-secondary">Loading…</p>
          ) : (
            <dl className="space-y-3 text-sm">
              <Row k="Transaction ID" v={String(detail.id)} mono />
              <Row k="Item" v={String(detail.item)} />
              <Row k="Type" v={String(detail.transactionType).replace('_', ' ')} />
              <Row k="Quantity" v={`${detail.quantity} ${detail.unit ?? ''}`} />
              <Row k="Balance" v={`${detail.balanceBefore} → ${detail.balanceAfter}`} />
              <Row k="Reference" v={<ReferenceDetail row={detail} />} />
              <Row k="Remarks" v={String(detail.remarks ?? '—')} />
              <Row k="Performed By" v={String(detail.performedBy ?? 'System')} />
              <Row k="Timestamp" v={new Date(String(detail.createdAt)).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' })} />
            </dl>
          )}
        </Modal>
      )}
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-2 last:border-0 last:pb-0">
      <dt className="text-xs font-semibold text-muted">{k}</dt>
      <dd className={`text-right text-sm font-medium text-ink ${mono ? 'font-mono text-xs' : ''}`}>{v}</dd>
    </div>
  );
}
