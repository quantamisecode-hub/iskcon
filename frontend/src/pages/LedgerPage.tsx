import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { fetchLedger, fetchFoodItemsList, fetchLedgerEntry, formatINR, type LedgerRow } from '../features/inventory/api/inventory.api';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';
import { DatePicker } from '../components/ui/DatePicker';
import { displayDateToIso, isoDateToDisplay } from '../utils/dateTime';
import { EVENT_TYPES, LEGACY_EVENT_TYPES } from '../constants/appConstants';
import {
  fetchFinancialLedger,
  fetchEventFinancialStatement,
  type FinancialLedger,
  type EventFinancialStatement,
  type ResultFilter,
  type StockFilter,
  type LedgerEventRow,
  type FinancialFilters,
} from '../features/financial/api/financial.api';

import { downloadLedgerReportPdf } from '../features/financial/api/LedgerReportPdf';

const formatMoney = formatINR;

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

/** Human-facing, deterministic transaction code — the raw UUID stays internal. */
function transactionCode(row: LedgerRow): string {
  const date = new Date(row.createdAt).toISOString().slice(0, 10).replace(/-/g, '');
  return `TXN-${date}-${String(row.id).replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

/** CSV export respects the currently applied financial filters. */
function exportLedgerCsv(rows: LedgerEventRow[]): void {
  const header = [
    'Event', 'Date', 'Event Type', 'Location', 'Donations', 'Charity Stock', 'Expense Stock',
    'Other Expenses', 'Total Resource Utilization', 'Cash Event Cost', 'Cash Result', 'Status',
  ];
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((row) =>
    [row.name, row.eventDate, row.eventType, row.location, row.donations, row.charityStock, row.expenseStock,
      row.otherExpenses, row.resourceUtilization, row.cashEventCost, row.cashResult, row.status]
      .map(escape)
      .join(','),
  );
  const url = URL.createObjectURL(new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `financial-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function LedgerPage() {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [type, setType] = useState('');
  const [itemId, setItemId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [stockType, setStockType] = useState<StockFilter>('ALL');
  const [resultFilter, setResultFilter] = useState<ResultFilter>('ALL');
  const [eventId, setEventId] = useState('');
  const [eventType, setEventType] = useState('');
  const [location, setLocation] = useState('');
  const [financial, setFinancial] = useState<FinancialLedger | null>(null);
  const [statement, setStatement] = useState<EventFinancialStatement | null>(null);
  const [statementEvent, setStatementEvent] = useState<LedgerEventRow | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
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

  const financialFilters = useMemo(
    () => ({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      stockType,
      result: resultFilter,
      eventId: eventId || undefined,
      eventType: eventType || undefined,
      location: location.trim() || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [dateFrom, dateTo, stockType, resultFilter, eventId, eventType, location, page],
  );

  useEffect(() => {
    fetchFoodItemsList({ pageSize: 100 }).then((r) => setItems(r.foodItems.map((f) => ({ id: f.id, name: f.name })))).catch(() => setItems([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchFinancialLedger(financialFilters)
      .then((r) => { if (!cancelled) setFinancial(r); })
      .catch(() => { if (!cancelled) setFinancial(null); });
    return () => { cancelled = true; };
  }, [financialFilters, retryTick]);

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

  useEffect(() => { setPage(1); }, [type, itemId, dateFrom, dateTo, stockType, resultFilter, eventId, eventType, location]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const exportLedgerPdf = async () => {
    if (!financial) return;
    setPdfBusy(true);
    try {
      await downloadLedgerReportPdf({ data: financial, filters: financialFilters as FinancialFilters });
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-primary">Inventory</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Inventory &amp; Financial Ledger</h1>
        <p className="mt-1 text-sm text-secondary">Resource utilisation versus cash result — stock type, donations and expenses in one place.</p>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger">
          <span>{error}</span>
          <button type="button" onClick={() => setRetryTick((t) => t + 1)} className="flex-none rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-danger transition hover:bg-red-100">Retry</button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Transaction type" className="rounded-xl border border-border-strong/70 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary">
          {TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option === '' ? 'All transaction types' : option.replace('_', ' ')}</option>)}
        </select>
        <select value={itemId} onChange={(e) => setItemId(e.target.value)} aria-label="Food item" className="rounded-xl border border-border-strong/70 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary">
          <option value="">All items</option>
          {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-secondary">From date</p>
          <DatePicker id="ledger-date-from" value={isoDateToDisplay(dateFrom)} onChange={(value) => setDateFrom(displayDateToIso(value) ?? '')} />
        </div>
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-secondary">To date</p>
          <DatePicker id="ledger-date-to" value={isoDateToDisplay(dateTo)} onChange={(value) => setDateTo(displayDateToIso(value) ?? '')} />
        </div>
        <select value={stockType} onChange={(e) => setStockType(e.target.value as StockFilter)} aria-label="Stock type" className="rounded-xl border border-border-strong/70 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary">
          <option value="ALL">All stock types</option>
          <option value="CHARITY">Charity only</option>
          <option value="EXPENSE">Expense only</option>
          <option value="UNCLASSIFIED">Unclassified only</option>
        </select>
        <select value={resultFilter} onChange={(e) => setResultFilter(e.target.value as ResultFilter)} aria-label="Financial result" className="rounded-xl border border-border-strong/70 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary">
          <option value="ALL">All results</option>
          <option value="SURPLUS">Surplus</option>
          <option value="DEFICIT">Deficit</option>
          <option value="BREAK_EVEN">Break-even</option>
        </select>
        <select value={eventType} onChange={(e) => setEventType(e.target.value)} aria-label="Event type" className="rounded-xl border border-border-strong/70 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary">
          <option value="">All event types</option>
          {[...EVENT_TYPES, ...LEGACY_EVENT_TYPES].map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
        <select value={eventId} onChange={(e) => setEventId(e.target.value)} aria-label="Event" className="rounded-xl border border-border-strong/70 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary">
          <option value="">All events</option>
          {(financial?.events ?? []).map((row) => <option key={row.id} value={row.id}>{row.eventCode} — {row.name}</option>)}
        </select>
        <div className="flex gap-2">
          <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} aria-label="Location" placeholder="Location" className="min-w-0 flex-1 rounded-xl border border-border-strong/70 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary" />
          <button type="button" onClick={() => { setType(''); setItemId(''); setDateFrom(''); setDateTo(''); setStockType('ALL'); setResultFilter('ALL'); setEventType(''); setEventId(''); setLocation(''); }} className="flex-none rounded-xl border border-border-strong/60 px-3 py-2.5 text-xs font-semibold text-ink transition hover:border-primary hover:text-primary">Clear</button>
        </div>
      </div>

      {financial && (
        <>
          <section>
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">Financial overview</h2>
            <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              {[
                { label: 'Cash Donations', value: financial.overview.cashDonations, tone: 'text-ink' },
                { label: 'Charity Stock Utilized', value: financial.overview.charityStockUtilized, tone: 'text-emerald-800' },
                { label: 'Expense Stock Consumed', value: financial.overview.expenseStockConsumed, tone: 'text-amber-800' },
                { label: 'Other Expenses', value: financial.overview.otherExpenses, tone: 'text-secondary' },
                { label: 'Total Resource Utilization', value: financial.overview.totalResourceUtilization, tone: 'text-primary-deep' },
                { label: 'Cash Surplus / Deficit', value: financial.overview.cashResult, tone: financial.overview.cashResult >= 0 ? 'text-emerald-800' : 'text-danger' },
              ].map((card) => (
                <div key={card.label} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-secondary">{card.label}</p>
                  <p className={`mt-1.5 text-lg font-bold tabular-nums ${card.tone}`}>{formatMoney(card.value)}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted">Resource utilisation includes in-kind charity value. Cash result excludes charity stock.</p>
          </section>

          <section className="rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">Event Financial Ledger</h2>
                <p className="mt-0.5 text-[11px] text-muted">Donations · charity · expense · other costs · cash result</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => exportLedgerCsv(financial.events)} disabled={financial.events.length === 0} className="rounded-xl border border-border-strong/60 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-ink transition hover:border-primary hover:text-primary disabled:opacity-50">Export CSV</button>
                <button type="button" onClick={() => void exportLedgerPdf()} disabled={pdfBusy || financial.events.length === 0} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-foreground transition hover:bg-primary-dark disabled:opacity-50">{pdfBusy ? 'Generating…' : 'Export PDF'}</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-background text-left text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">
                    <th className="px-4 py-3">Event</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Event Type</th>
                    <th className="px-4 py-3 text-right">Donations</th>
                    <th className="px-4 py-3 text-right">Charity Stock</th>
                    <th className="px-4 py-3 text-right">Expense Stock</th>
                    <th className="px-4 py-3 text-right">Other Expenses</th>
                    <th className="px-4 py-3 text-right">Resource Cost</th>
                    <th className="px-4 py-3 text-right">Cash Result</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {financial.events.map((row) => (
                    <tr key={row.id} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-background/60" onClick={() => {
                      setStatementEvent(row);
                      setStatement(null);
                      setStatementLoading(true);
                      void fetchEventFinancialStatement(row.id).then(setStatement).catch(() => setStatement(null)).finally(() => setStatementLoading(false));
                    }}>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-ink">{row.name}</span>
                        <span className="mt-0.5 block font-mono text-[10px] text-muted">{row.eventCode}</span>
                      </td>
                      <td className="px-4 py-3 text-xs tabular-nums text-secondary">{row.eventDate}</td>
                      <td className="px-4 py-3 text-xs text-secondary">{row.eventType ?? '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink">{formatMoney(row.donations)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-emerald-800">{formatMoney(row.charityStock)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-amber-800">{formatMoney(row.expenseStock)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-secondary">{formatMoney(row.otherExpenses)}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-ink">{formatMoney(row.resourceUtilization)}</td>
                      <td className={`px-4 py-3 text-right font-bold tabular-nums ${row.cashResult >= 0 ? 'text-emerald-800' : 'text-danger'}`}>{formatMoney(row.cashResult)}</td>
                      <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${row.result === 'SURPLUS' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : row.result === 'DEFICIT' ? 'border-danger/30 bg-danger-soft text-danger' : 'border-border bg-background text-secondary'}`}>{row.result.replace('_', ' ')}</span></td>
                    </tr>
                  ))}
                  {financial.events.length === 0 && (
                    <tr><td colSpan={10} className="px-4 py-8 text-center text-sm text-secondary">No events match these financial filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-3">
              <p className="text-xs text-secondary">{financial.total} events</p>
              <div className="flex items-center gap-2">
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-xl border border-border-strong/60 px-3 py-1.5 text-sm disabled:opacity-40">← Prev</button>
                <span className="px-2 text-xs font-semibold">Page {page} of {Math.max(1, Math.ceil(financial.total / PAGE_SIZE))}</span>
                <button type="button" disabled={page >= Math.ceil(financial.total / PAGE_SIZE)} onClick={() => setPage((p) => p + 1)} className="rounded-xl border border-border-strong/60 px-3 py-1.5 text-sm disabled:opacity-40">Next →</button>
              </div>
            </div>
          </section>
        </>
      )}

      <section>
        <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">Inventory Transactions</h2>
        <p className="mt-0.5 text-[11px] text-muted">Stock movements only — written by stock operations, never by hand.</p>
      </section>

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
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-border bg-background text-left text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Lot Number</th>
                  <th className="px-4 py-3">Stock Type</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Cost</th>
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
                      <td className="px-4 py-3 font-mono text-[11px] text-secondary">{row.lotNumber ?? '—'}</td>
                      <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${row.stockType === 'CHARITY' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : row.stockType === 'EXPENSE' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-border bg-background text-secondary'}`}>{row.stockType ?? '—'}</span></td>
                      <td className={`px-4 py-3 text-right font-bold tabular-nums ${isIn ? 'text-emerald-700' : row.transactionType === 'STOCK_OUT' ? 'text-red-700' : 'text-secondary'}`}>{isIn ? '+' : row.transactionType === 'STOCK_OUT' ? '−' : '±'}{Math.abs(row.quantity)} {row.unit}</td>
                      <td className="px-4 py-3 text-right text-xs tabular-nums text-secondary">
                        {row.totalCost === null ? '—' : formatINR(row.totalCost)}
                        {row.unitCost !== null && <span className="block text-[10px] text-muted">@ {formatINR(row.unitCost)}</span>}
                      </td>
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
              <Row k="Transaction ID" v={transactionCode(detail)} mono />
              <Row k="Item" v={String(detail.item)} />
              <Row k="Vendor" v={detail.vendor?.name ?? '—'} />
              <Row k="Type" v={String(detail.transactionType).replace('_', ' ')} />
              <Row k="Quantity" v={`${detail.quantity} ${detail.unit ?? ''}`} />
              <Row k="Lot Number" v={detail.lotNumber ?? '—'} mono />
              <Row k="Stock Type" v={detail.stockType ?? 'Unclassified (legacy)'} />
              <Row k="Unit Cost" v={formatINR(detail.unitCost)} />
              <Row k="Total Cost" v={formatINR(detail.totalCost)} />
              <Row k="Balance" v={`${detail.balanceBefore} → ${detail.balanceAfter}`} />
              <Row k="Reference" v={<ReferenceDetail row={detail} />} />
              <Row k="Remarks" v={String(detail.remarks ?? '—')} />
              <Row k="Performed By" v={String(detail.performedBy ?? 'System')} />
              <Row k="Timestamp" v={new Date(String(detail.createdAt)).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' })} />
            </dl>
          )}
        </Modal>
      )}

      {statementEvent && (
        <Modal title={`Financial Statement — ${statementEvent.name}`} onClose={() => { setStatementEvent(null); setStatement(null); }} maxWidthClass="max-w-3xl">
          {statementLoading || !statement ? (
            <p className="text-sm text-secondary">Loading statement…</p>
          ) : (
            <div className="space-y-5 text-sm">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Cash Donations', value: statement.revenue.cashDonations },
                  { label: 'Charity Stock', value: statement.inventory.charityValue },
                  { label: 'Expense Stock', value: statement.inventory.expenseValue },
                  { label: 'Other Expenses', value: statement.totals.otherExpenses },
                  { label: 'Resource Utilization', value: statement.totals.resourceUtilization },
                  { label: 'Cash Event Cost', value: statement.totals.cashEventCost },
                  { label: 'Cash Result', value: statement.totals.cashResult },
                  { label: 'Cost / Person', value: statement.totals.costPerPerson },
                ].map((card) => (
                  <div key={card.label} className="rounded-xl border border-border bg-background px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-secondary">{card.label}</p>
                    <p className="mt-1 text-sm font-bold tabular-nums text-ink">{formatMoney(card.value)}</p>
                  </div>
                ))}
              </div>
              <p className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-secondary">
                Charity stock is an in-kind contribution ({formatMoney(statement.inventory.charityValue)}). It is included in resource utilisation but excluded from cash cost.
              </p>
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">Inventory consumption by stock type</h3>
                <div className="mt-2 overflow-x-auto rounded-xl border border-border">
                  <table className="w-full min-w-[560px] text-xs">
                    <thead><tr className="border-b border-border bg-background text-left text-[10px] font-bold uppercase tracking-wider text-secondary">
                      <th className="px-3 py-2">Item</th><th className="px-3 py-2">Type</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">FIFO Value</th>
                    </tr></thead>
                    <tbody>
                      {statement.byItem.map((item) => (
                        <tr key={`${item.foodItemId}-${item.stockType ?? 'UNCLASSIFIED'}`} className="border-b border-border/60 last:border-0">
                          <td className="px-3 py-2 font-semibold text-ink">{item.name}</td>
                          <td className="px-3 py-2 uppercase text-secondary">{item.stockType ?? 'Unclassified'}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{item.quantity} {item.unit}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-ink">{formatMoney(item.value)}</td>
                        </tr>
                      ))}
                      {statement.byItem.length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-center text-secondary">No inventory consumed.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">FIFO allocation detail</h3>
                <div className="mt-2 overflow-x-auto rounded-xl border border-border">
                  <table className="w-full min-w-[720px] text-xs">
                    <thead><tr className="border-b border-border bg-background text-left text-[10px] font-bold uppercase tracking-wider text-secondary">
                      <th className="px-3 py-2">Lot</th><th className="px-3 py-2">Vendor</th><th className="px-3 py-2">Received</th><th className="px-3 py-2">Type</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Rate</th><th className="px-3 py-2 text-right">Value</th>
                    </tr></thead>
                    <tbody>
                      {statement.fifoDetail.map((line) => (
                        <tr key={line.allocationId} className="border-b border-border/60 last:border-0">
                          <td className="px-3 py-2 font-mono text-ink">{line.lotNumber}</td>
                          <td className="px-3 py-2 text-secondary">{line.vendorName ?? '—'}</td>
                          <td className="px-3 py-2 tabular-nums text-secondary">{line.receivedDate}</td>
                          <td className="px-3 py-2 uppercase text-secondary">{line.stockType ?? 'Unclassified'}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{line.quantity}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(line.unitCost)}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink">{formatMoney(line.value)}</td>
                        </tr>
                      ))}
                      {statement.fifoDetail.length === 0 && <tr><td colSpan={7} className="px-3 py-4 text-center text-secondary">No FIFO allocations recorded.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">Other expenses</h3>
                  {statement.otherExpenses.length === 0 ? <p className="mt-2 text-xs text-muted">None recorded.</p> : (
                    <ul className="mt-2 space-y-1">
                      {statement.otherExpenses.map((expense) => (
                        <li key={expense.id} className="flex justify-between gap-3 rounded-lg border border-border px-3 py-2">
                          <span className="text-secondary">{expense.category} — {expense.description}</span>
                          <span className="font-semibold tabular-nums text-ink">{formatMoney(expense.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">Donations</h3>
                  <p className="mt-2 text-xs text-secondary">Source: {statement.revenue.donationType ?? '—'} · {statement.revenue.donationGivenBy ?? '—'} · Ref: {statement.revenue.trNumber ?? '—'}</p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-ink">{formatMoney(statement.revenue.cashDonations)}</p>
                </div>
              </div>
            </div>
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
