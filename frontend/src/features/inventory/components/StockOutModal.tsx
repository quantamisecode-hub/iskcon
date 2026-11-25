import { useEffect, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { FieldLabel } from '../../../components/ui/FieldLabel';
import { APP_CONSTANTS } from '../../../constants/appConstants';
import {
  fetchFifoPreview,
  fetchFoodItemDetail,
  fetchFoodItemsList,
  formatINR,
  stockOut,
  type FifoPreview,
  type FoodItemRow,
} from '../api/inventory.api';
import { fetchEvents } from '../../events/api/events.api';
import type { EventListItem } from '../../events/types';
import { useAuth } from '../../../hooks/useAuth';

const QUANTITY_STEP = 10 ** -APP_CONSTANTS.quantityPrecision;
const FIFO_DEBOUNCE_MS = 300;

function parseQuantity(raw: string): number | null {
  if (raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  const factor = 10 ** APP_CONSTANTS.quantityPrecision;
  return Math.round(value * factor) / factor;
}

export interface StockOutModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedItem?: FoodItemRow | null;
  onSuccess?: () => void;
}

export function StockOutModal({
  isOpen,
  onClose,
  preselectedItem,
  onSuccess,
}: StockOutModalProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [allItems, setAllItems] = useState<FoodItemRow[]>([]);
  const [recentEvents, setRecentEvents] = useState<EventListItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<FoodItemRow | null>(preselectedItem ?? null);
  const [liveStock, setLiveStock] = useState<number | null>(null);
  const [isStockLoading, setIsStockLoading] = useState(false);

  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [eventId, setEventId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const [fifoPreview, setFifoPreview] = useState<FifoPreview | null>(null);
  const [fifoLoading, setFifoLoading] = useState(false);
  const [fifoError, setFifoError] = useState<string | null>(null);

  const activeItem = selectedItem ?? preselectedItem ?? null;

  useEffect(() => {
    if (isOpen) {
      setSelectedItem(preselectedItem ?? null);
      setLiveStock(null);
      setIsStockLoading(false);
      setQty('');
      setReason('');
      setEventId('');
      setError(null);
      setIsBusy(false);
      setFifoPreview(null);
      setFifoError(null);

      if (!preselectedItem) {
        fetchFoodItemsList({ isActive: true, pageSize: 100 })
          .then((res) => setAllItems(res.foodItems))
          .catch(() => {});
      }
      fetchEvents({ pageSize: 50 })
        .then((res) => setRecentEvents(res.events))
        .catch(() => {});
    }
  }, [isOpen, preselectedItem]);

  // Dynamically load live stock whenever an item is preselected or picked
  useEffect(() => {
    if (!isOpen || !activeItem?.id) {
      setLiveStock(null);
      setIsStockLoading(false);
      return;
    }
    let cancelled = false;
    setIsStockLoading(true);
    fetchFoodItemDetail(activeItem.id)
      .then((detail) => {
        if (!cancelled) {
          const q = Number(detail.currentQuantity ?? detail.inventory?.currentQuantity ?? 0);
          setLiveStock(q);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLiveStock(Number(activeItem.inventory?.currentQuantity ?? 0));
        }
      })
      .finally(() => {
        if (!cancelled) setIsStockLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, activeItem?.id]);

  // FIFO live preview calculation
  useEffect(() => {
    if (!isAdmin || !activeItem) {
      setFifoPreview(null);
      setFifoError(null);
      return;
    }
    const parsedQty = parseQuantity(qty);
    if (!parsedQty) {
      setFifoPreview(null);
      setFifoError(null);
      return;
    }
    const timer = setTimeout(() => {
      setFifoLoading(true);
      fetchFifoPreview(activeItem.id, parsedQty)
        .then((preview) => {
          setFifoPreview(preview);
          setFifoError(null);
        })
        .catch((err: unknown) => {
          const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
          setFifoError(msg ?? 'Could not calculate FIFO preview.');
          setFifoPreview(null);
        })
        .finally(() => setFifoLoading(false));
    }, FIFO_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [isAdmin, activeItem, qty]);

  if (!isOpen) return null;

  const currentStock = liveStock !== null ? liveStock : Number(activeItem?.inventory?.currentQuantity ?? 0);

  const handleSubmit = async () => {
    setError(null);
    if (!activeItem) {
      setError('Choose a food item first.');
      return;
    }
    const q = parseQuantity(qty);
    if (q === null) {
      setError(`Quantity must be a positive number (up to ${APP_CONSTANTS.quantityPrecision} decimals).`);
      return;
    }
    if (q > currentStock) {
      setError(`Cannot issue ${q} ${activeItem.unit?.symbol ?? ''} — only ${currentStock} available in stock.`);
      return;
    }
    if (!reason.trim()) {
      setError('Reason is required for Stock Out.');
      return;
    }

    setIsBusy(true);
    try {
      await stockOut(activeItem.id, q, {
        reason: reason.trim(),
        referenceType: eventId ? 'EVENT' : undefined,
        referenceId: eventId || null,
      });

      window.dispatchEvent(new CustomEvent('inventory-refresh'));
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? 'Could not record stock out. Please verify your inputs.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Modal title="Stock Out" onClose={onClose} maxWidthClass="max-w-2xl">
      <div className="space-y-4">
        {/* Food item selection / unselectable format */}
        <div>
          <FieldLabel htmlFor="stock-out-item" className="mb-1.5 block text-xs font-semibold text-ink">
            Food Item *
          </FieldLabel>
          {preselectedItem ? (
            <div className="rounded-xl border border-border-strong/70 bg-[#fbf6ef] p-3 shadow-xs">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-ink">{preselectedItem.name}</span>
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      Preselected
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-secondary">
                    Category: <span className="font-medium text-ink">{preselectedItem.category?.name ?? '—'}</span> · Unit:{' '}
                    <span className="font-medium text-ink">{preselectedItem.unit?.symbol ?? preselectedItem.unit?.name}</span>
                  </p>
                </div>
                <div className="flex-none text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Current Stock</p>
                  <p className="text-sm font-bold tabular-nums text-ink">
                    {isStockLoading && liveStock === null ? (
                      <span className="text-xs text-muted">Loading…</span>
                    ) : (
                      `${currentStock} ${preselectedItem.unit?.symbol ?? ''}`
                    )}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <select
                id="stock-out-item"
                value={selectedItem?.id ?? ''}
                onChange={(e) => {
                  const item = allItems.find((i) => i.id === e.target.value) ?? null;
                  setSelectedItem(item);
                }}
                className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
              >
                <option value="">Select food item…</option>
                {allItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.category?.name ?? 'General'} · {item.unit?.symbol ?? item.unit?.name})
                  </option>
                ))}
              </select>
              {selectedItem && (
                <div className="mt-2 flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-2">
                  <span className="text-xs font-semibold text-secondary">
                    Current available for <strong className="text-ink">{selectedItem.name}</strong>:
                  </span>
                  <span className="text-sm font-bold tabular-nums text-primary">
                    {isStockLoading && liveStock === null ? 'Loading…' : `${currentStock} ${selectedItem.unit?.symbol ?? ''}`}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quantity */}
        <div>
          <FieldLabel htmlFor="stock-out-qty" className="mb-1.5 block text-xs font-semibold text-ink">
            Quantity to issue *
          </FieldLabel>
          <input
            id="stock-out-qty"
            type="number"
            min={QUANTITY_STEP}
            step={QUANTITY_STEP}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="e.g. 50"
            className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
          />
          {activeItem && (
            <p className="mt-1.5 text-[10px] leading-snug text-muted">
              Max available:{' '}
              <span className="font-semibold text-ink">
                {isStockLoading && liveStock === null ? 'Loading…' : `${currentStock} ${activeItem.unit?.symbol ?? ''}`}
              </span>
            </p>
          )}
        </div>

        {/* Reason */}
        <div>
          <FieldLabel htmlFor="stock-out-reason" className="mb-1.5 block text-xs font-semibold text-ink">
            Reason *
          </FieldLabel>
          <input
            id="stock-out-reason"
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Issued to event, Used in kitchen, Damaged"
            maxLength={500}
            className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
          />
        </div>

        {/* Issue to event */}
        <div>
          <FieldLabel htmlFor="stock-out-event" className="mb-1.5 block text-xs font-semibold text-ink">
            Issue to event <span className="font-normal text-muted">(optional)</span>
          </FieldLabel>
          <select
            id="stock-out-event"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
          >
            <option value="">No event linked</option>
            {recentEvents.map((event) => (
              <option key={event.id} value={event.id}>
                {event.eventCode} — {event.name}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[10px] leading-snug text-muted">
            Stock Out writes a ledger row and audit entry. This is a real stock movement — it cannot be undone.
          </p>
        </div>

        {/* FIFO Allocation Breakdown (Admin only) */}
        {isAdmin && (
          <section className="rounded-xl border border-border bg-background/60 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">FIFO Allocation Preview</h3>
              {fifoLoading && <span className="text-[10px] font-semibold text-primary">Calculating…</span>}
            </div>
            {fifoError ? (
              <p role="status" className="mt-2 text-[11px] text-amber-800">{fifoError}</p>
            ) : fifoPreview && fifoPreview.allocations.length > 0 ? (
              <div className="mt-2.5 space-y-2">
                <div className="overflow-x-auto rounded-lg border border-border bg-white">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-background text-left text-[9px] font-bold uppercase tracking-wider text-secondary">
                        <th className="px-2.5 py-1.5">Lot</th>
                        <th className="px-2.5 py-1.5">Source</th>
                        <th className="px-2.5 py-1.5">Received</th>
                        <th className="px-2.5 py-1.5 text-right">Quantity</th>
                        <th className="px-2.5 py-1.5 text-right">Rate</th>
                        <th className="px-2.5 py-1.5 text-right">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fifoPreview.allocations.map((alloc) => (
                        <tr key={alloc.stockLotId} className="border-b border-border/50 last:border-0">
                          <td className="px-2.5 py-1.5 font-mono text-[11px] font-semibold text-ink">{alloc.lotNumber}</td>
                          <td className="px-2.5 py-1.5 text-secondary">{alloc.vendorName ?? '—'}</td>
                          <td className="px-2.5 py-1.5 tabular-nums text-muted">{alloc.receivedDate}</td>
                          <td className="px-2.5 py-1.5 text-right font-semibold tabular-nums text-ink">{alloc.quantityAllocated}</td>
                          <td className="px-2.5 py-1.5 text-right tabular-nums text-secondary">{formatINR(alloc.unitCost)}</td>
                          <td className="px-2.5 py-1.5 text-right font-semibold tabular-nums text-ink">{formatINR(alloc.totalCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between text-xs font-semibold text-secondary px-1">
                  <span>Total Estimated Valuation:</span>
                  <span className="text-sm font-bold tabular-nums text-ink">{formatINR(fifoPreview.totalCost)}</span>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-muted">
                {qty ? 'Enter a valid quantity to view which stock lots will be consumed first.' : 'Enter quantity to preview FIFO lot depletion order.'}
              </p>
            )}
          </section>
        )}

        {error && (
          <p role="alert" className="text-xs font-semibold text-danger">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-background"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => void handleSubmit()}
            className="rounded-xl bg-danger px-5 py-2.5 text-sm font-semibold text-white hover:bg-danger/90 disabled:opacity-70"
          >
            {isBusy ? 'Recording…' : 'Record Stock Out'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
