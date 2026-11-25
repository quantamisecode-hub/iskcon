import { useEffect, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { FieldLabel } from '../../../components/ui/FieldLabel';
import { DatePicker } from '../../../components/ui/DatePicker';
import { APP_CONSTANTS } from '../../../constants/appConstants';
import { displayDateToIso, isoDateToDisplay } from '../../../utils/dateTime';
import {
  fetchFoodItemDetail,
  fetchFoodItemsList,
  fetchVendors,
  formatINR,
  stockIn,
  type FoodItemRow,
  type VendorRow,
} from '../api/inventory.api';
import { useAuth } from '../../../hooks/useAuth';

const QUANTITY_STEP = 10 ** -APP_CONSTANTS.quantityPrecision;

function todayIso(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function parseQuantity(raw: string): number | null {
  if (raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  const factor = 10 ** APP_CONSTANTS.quantityPrecision;
  return Math.round(value * factor) / factor;
}

export interface StockInModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedItem?: FoodItemRow | null;
  onSuccess?: () => void;
}

export function StockInModal({
  isOpen,
  onClose,
  preselectedItem,
  onSuccess,
}: StockInModalProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [allItems, setAllItems] = useState<FoodItemRow[]>([]);
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [selectedItem, setSelectedItem] = useState<FoodItemRow | null>(preselectedItem ?? null);
  const [liveStock, setLiveStock] = useState<number | null>(null);
  const [isStockLoading, setIsStockLoading] = useState(false);

  const [stockType, setStockType] = useState<'CHARITY' | 'EXPENSE' | ''>('');
  const [donorName, setDonorName] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [receivedDate, setReceivedDate] = useState(todayIso());
  const [qty, setQty] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const activeItem = selectedItem ?? preselectedItem ?? null;

  useEffect(() => {
    if (isOpen) {
      setSelectedItem(preselectedItem ?? null);
      setLiveStock(null);
      setIsStockLoading(false);
      setStockType('');
      setDonorName('');
      setVendorId('');
      setPurchaseDate('');
      setReceivedDate(todayIso());
      setQty('');
      setUnitCost('');
      setReference('');
      setNotes('');
      setError(null);
      setIsBusy(false);

      if (!preselectedItem) {
        fetchFoodItemsList({ isActive: true, pageSize: 100 })
          .then((res) => setAllItems(res.foodItems))
          .catch(() => {});
      }
      fetchVendors({ isActive: true, pageSize: 100 })
        .then((res) => setVendors(res.vendors))
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

  if (!isOpen) return null;

  const totalCostEstimate = (() => {
    const q = parseQuantity(qty);
    const c = Number(unitCost);
    if (q === null || !Number.isFinite(c) || c < 0) return null;
    return q * c;
  })();

  const handleSubmit = async () => {
    setError(null);
    if (!selectedItem) {
      setError('Choose a food item first.');
      return;
    }
    const q = parseQuantity(qty);
    if (q === null) {
      setError(`Quantity must be a positive number (up to ${APP_CONSTANTS.quantityPrecision} decimals).`);
      return;
    }
    if (stockType !== 'CHARITY' && stockType !== 'EXPENSE') {
      setError('Select the type of stock: Charity or Expense.');
      return;
    }
    if (stockType === 'CHARITY' && !donorName.trim()) {
      setError('Enter the name of the donor who provided this stock.');
      return;
    }
    if (!receivedDate) {
      setError('Received date is required.');
      return;
    }
    if (!unitCost.trim() || Number.isNaN(Number(unitCost)) || Number(unitCost) <= 0) {
      setError('Unit cost is required (must be greater than 0).');
      return;
    }

    setIsBusy(true);
    try {
      await stockIn(selectedItem.id, q, stockType === 'EXPENSE' ? (vendorId || null) : null, {
        stockType,
        donorName: stockType === 'CHARITY' ? donorName.trim() : null,
        purchaseDate: purchaseDate || undefined,
        receivedDate,
        unitCost: Number(unitCost),
        referenceNumber: stockType === 'EXPENSE' && reference.trim() ? reference.trim() : undefined,
        notes: notes.trim() || undefined,
      });

      window.dispatchEvent(new CustomEvent('inventory-refresh'));
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? 'Could not record stock in. Please verify your inputs.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Modal title="Stock In" onClose={onClose} maxWidthClass="max-w-lg">
      <div className="space-y-4">
        {/* Food item selection / unselectable format */}
        <div>
          <FieldLabel htmlFor="stock-item" className="mb-1.5 block text-xs font-semibold text-ink">
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
                      `${liveStock !== null ? liveStock : (preselectedItem.inventory?.currentQuantity ?? 0)} ${preselectedItem.unit?.symbol ?? ''}`
                    )}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <select
                id="stock-item"
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
                    Current stock for <strong className="text-ink">{selectedItem.name}</strong>:
                  </span>
                  <span className="text-sm font-bold tabular-nums text-primary">
                    {isStockLoading && liveStock === null ? 'Loading…' : `${liveStock !== null ? liveStock : (selectedItem.inventory?.currentQuantity ?? 0)} ${selectedItem.unit?.symbol ?? ''}`}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Stock Type */}
        <div>
          <FieldLabel htmlFor="stock-type" className="mb-1.5 block text-xs font-semibold text-ink">
            Type of Stock *
          </FieldLabel>
          <select
            id="stock-type"
            value={stockType}
            required
            onChange={(e) => setStockType(e.target.value as 'CHARITY' | 'EXPENSE' | '')}
            className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
          >
            <option value="">Select type of stock…</option>
            <option value="CHARITY">Charity</option>
            <option value="EXPENSE">Expense</option>
          </select>
          <p className="mt-1.5 text-[10px] leading-snug text-muted">
            {stockType === 'CHARITY'
              ? APP_CONSTANTS.stockType.descriptions.CHARITY
              : stockType === 'EXPENSE'
                ? APP_CONSTANTS.stockType.descriptions.EXPENSE
                : 'Charity: received as a donation / in-kind. Expense: purchased or received as an organisational cost.'}
          </p>
        </div>

        {/* Donor Name if Charity */}
        {stockType === 'CHARITY' && (
          <div>
            <FieldLabel htmlFor="stock-donor" className="mb-1.5 block text-xs font-semibold text-ink">
              Donated by *
            </FieldLabel>
            <input
              id="stock-donor"
              type="text"
              required
              maxLength={200}
              value={donorName}
              onChange={(e) => setDonorName(e.target.value)}
              placeholder="Name of the person who donated"
              className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
            <p className="mt-1 text-[10px] text-muted">Charity stock is recorded as an in-kind contribution from this donor.</p>
          </div>
        )}

        {/* Vendor if Expense */}
        {stockType === 'EXPENSE' && (
          <div>
            <FieldLabel htmlFor="stock-vendor" className="mb-1.5 block text-xs font-semibold text-ink">
              Vendor <span className="font-normal text-muted">(optional)</span>
            </FieldLabel>
            <select
              id="stock-vendor"
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
            >
              <option value="">None</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-muted">Credit this delivery to a vendor — it will appear on the ledger entry.</p>
          </div>
        )}

        {/* Dates */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="stock-purchase-date" className="mb-1.5 block text-xs font-semibold text-ink">
              {stockType === 'CHARITY' ? 'Donation Date' : 'Purchase Date'} <span className="font-normal text-muted">(optional)</span>
            </FieldLabel>
            <DatePicker
              id="stock-purchase-date"
              value={isoDateToDisplay(purchaseDate)}
              onChange={(value) => setPurchaseDate(displayDateToIso(value) ?? '')}
            />
          </div>
          <div>
            <FieldLabel htmlFor="stock-received-date" className="mb-1.5 block text-xs font-semibold text-ink">
              Received Date *
            </FieldLabel>
            <DatePicker
              id="stock-received-date"
              value={isoDateToDisplay(receivedDate)}
              onChange={(value) => setReceivedDate(displayDateToIso(value) ?? '')}
            />
          </div>
        </div>

        {/* Quantity & Unit Cost */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="stock-qty" className="mb-1.5 block text-xs font-semibold text-ink">
              Quantity received *
            </FieldLabel>
            <input
              id="stock-qty"
              type="number"
              min={QUANTITY_STEP}
              step={QUANTITY_STEP}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="e.g. 50"
              className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
          </div>
          <div>
            <FieldLabel htmlFor="stock-unit-cost" className="mb-1.5 block text-xs font-semibold text-ink">
              Unit Cost (₹) *
            </FieldLabel>
            <input
              id="stock-unit-cost"
              type="number"
              min={0.01}
              step={0.01}
              required
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              placeholder="e.g. 120.50"
              className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
          </div>
        </div>

        {/* Total Cost Estimate Preview */}
        {isAdmin && (
          <div className="flex items-baseline justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-secondary">Total Cost (estimated)</span>
            <span className="text-base font-bold tabular-nums text-ink">{formatINR(totalCostEstimate)}</span>
          </div>
        )}

        {/* Reference Number if Expense */}
        {stockType === 'EXPENSE' && (
          <div>
            <FieldLabel htmlFor="stock-reference" className="mb-1.5 block text-xs font-semibold text-ink">
              Reference / Invoice Number <span className="font-normal text-muted">(optional)</span>
            </FieldLabel>
            <input
              id="stock-reference"
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              maxLength={100}
              placeholder="e.g. INV-2026-0142"
              className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
          </div>
        )}

        {/* Notes */}
        <div>
          <FieldLabel htmlFor="stock-notes" className="mb-1.5 block text-xs font-semibold text-ink">
            Notes <span className="font-normal text-muted">(optional)</span>
          </FieldLabel>
          <textarea
            id="stock-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            placeholder="Delivery condition, batch remarks…"
            className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
          />
        </div>

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
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-dark disabled:opacity-70"
          >
            {isBusy ? 'Recording…' : 'Record Stock In'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
