import { useEffect, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { FieldLabel } from '../../../components/ui/FieldLabel';
import { DatePicker } from '../../../components/ui/DatePicker';
import { APP_CONSTANTS } from '../../../constants/appConstants';
import { displayDateToIso, isoDateToDisplay } from '../../../utils/dateTime';
import {
  fetchVendors,
  formatINR,
  updateStockLot,
  type StockLotRow,
  type StockLotStatus,
  type VendorRow,
} from '../api/inventory.api';

export interface EditStockLotModalProps {
  lot: StockLotRow | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function EditStockLotModal({
  lot,
  isOpen,
  onClose,
  onSuccess,
}: EditStockLotModalProps) {
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [vendorId, setVendorId] = useState('');
  const [stockType, setStockType] = useState<'CHARITY' | 'EXPENSE' | ''>('');
  const [donorName, setDonorName] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [receivedDate, setReceivedDate] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [status, setStatus] = useState<StockLotStatus>('AVAILABLE');
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (isOpen && lot) {
      setVendorId(lot.vendorId ?? '');
      setStockType(lot.stockType ?? '');
      setDonorName(lot.donorName ?? '');
      setPurchaseDate(lot.purchaseDate ?? '');
      setReceivedDate(lot.receivedDate ?? '');
      setUnitCost(lot.unitCost !== null && lot.unitCost !== undefined ? String(lot.unitCost) : '');
      setStatus(lot.status);
      setError(null);
      setIsBusy(false);

      fetchVendors({ isActive: true, pageSize: 100 })
        .then((res) => setVendors(res.vendors))
        .catch(() => {});
    }
  }, [isOpen, lot]);

  if (!isOpen || !lot) return null;

  const totalCostEstimate = (() => {
    const c = Number(unitCost);
    if (!Number.isFinite(c) || c < 0) return null;
    return lot.quantityReceived * c;
  })();

  const handleSubmit = async () => {
    setError(null);
    if (!receivedDate) {
      setError('Received date is required.');
      return;
    }
    if (stockType === 'CHARITY' && !donorName.trim()) {
      setError('Donor name is required for Charity stock.');
      return;
    }

    const parsedUnitCost = unitCost.trim() !== '' ? Number(unitCost) : null;
    if (parsedUnitCost !== null && (Number.isNaN(parsedUnitCost) || parsedUnitCost < 0)) {
      setError('Unit cost must be a non-negative number.');
      return;
    }

    setIsBusy(true);
    try {
      await updateStockLot(lot.id, {
        vendorId: stockType === 'EXPENSE' ? (vendorId || null) : null,
        stockType: stockType || null,
        donorName: stockType === 'CHARITY' ? donorName.trim() : null,
        purchaseDate: purchaseDate || null,
        receivedDate,
        unitCost: parsedUnitCost,
        status,
      });

      window.dispatchEvent(new CustomEvent('inventory-refresh'));
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? 'Could not update stock lot. Please verify your inputs.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Modal title={`Edit Stock Lot — ${lot.lotNumber}`} onClose={onClose} maxWidthClass="max-w-lg">
      <div className="space-y-4">
        {/* Lot info read-only header */}
        <div className="rounded-xl border border-border-strong/70 bg-[#fbf6ef] p-3 shadow-xs">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-xs font-bold text-ink">{lot.lotNumber}</p>
              <p className="mt-0.5 text-xs text-secondary">
                Food Item: <span className="font-semibold text-ink">{lot.foodItemName}</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Remaining / Received</p>
              <p className="text-xs font-bold tabular-nums text-ink">
                {lot.quantityRemaining} / {lot.quantityReceived}
              </p>
            </div>
          </div>
        </div>

        {/* Stock Type */}
        <div>
          <FieldLabel htmlFor="edit-lot-type" className="mb-1.5 block text-xs font-semibold text-ink">
            Type of Stock
          </FieldLabel>
          <select
            id="edit-lot-type"
            value={stockType}
            onChange={(e) => setStockType(e.target.value as 'CHARITY' | 'EXPENSE' | '')}
            className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
          >
            <option value="">Unclassified (Legacy)</option>
            <option value="CHARITY">Charity</option>
            <option value="EXPENSE">Expense</option>
          </select>
          <p className="mt-1 text-[10px] text-muted">
            {stockType === 'CHARITY'
              ? APP_CONSTANTS.stockType.descriptions.CHARITY
              : stockType === 'EXPENSE'
                ? APP_CONSTANTS.stockType.descriptions.EXPENSE
                : 'Legacy lots may remain unclassified until administrative review.'}
          </p>
        </div>

        {/* Donor Name if Charity */}
        {stockType === 'CHARITY' && (
          <div>
            <FieldLabel htmlFor="edit-lot-donor" className="mb-1.5 block text-xs font-semibold text-ink">
              Donated by *
            </FieldLabel>
            <input
              id="edit-lot-donor"
              type="text"
              required
              maxLength={200}
              value={donorName}
              onChange={(e) => setDonorName(e.target.value)}
              placeholder="Name of donor"
              className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
          </div>
        )}

        {/* Vendor if Expense */}
        {stockType === 'EXPENSE' && (
          <div>
            <FieldLabel htmlFor="edit-lot-vendor" className="mb-1.5 block text-xs font-semibold text-ink">
              Vendor
            </FieldLabel>
            <select
              id="edit-lot-vendor"
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
          </div>
        )}

        {/* Dates */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="edit-lot-purchase-date" className="mb-1.5 block text-xs font-semibold text-ink">
              {stockType === 'CHARITY' ? 'Donation Date' : 'Purchase Date'}
            </FieldLabel>
            <DatePicker
              id="edit-lot-purchase-date"
              value={isoDateToDisplay(purchaseDate)}
              onChange={(val) => setPurchaseDate(displayDateToIso(val) ?? '')}
            />
          </div>
          <div>
            <FieldLabel htmlFor="edit-lot-received-date" className="mb-1.5 block text-xs font-semibold text-ink">
              Received Date *
            </FieldLabel>
            <DatePicker
              id="edit-lot-received-date"
              value={isoDateToDisplay(receivedDate)}
              onChange={(val) => setReceivedDate(displayDateToIso(val) ?? '')}
            />
          </div>
        </div>

        {/* Unit Cost */}
        <div>
          <FieldLabel htmlFor="edit-lot-unit-cost" className="mb-1.5 block text-xs font-semibold text-ink">
            Unit Cost / Rate (₹) *
          </FieldLabel>
          <input
            id="edit-lot-unit-cost"
            type="number"
            min={0}
            step={0.01}
            required
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
            placeholder="e.g. 120.50"
            className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
          />
        </div>

        {/* Total Cost live preview */}
        <div className="flex items-baseline justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-secondary">
            Recalculated Total Cost
          </span>
          <span className="text-base font-bold tabular-nums text-ink">{formatINR(totalCostEstimate)}</span>
        </div>

        {/* Status */}
        <div>
          <FieldLabel htmlFor="edit-lot-status" className="mb-1.5 block text-xs font-semibold text-ink">
            Lot Status
          </FieldLabel>
          <select
            id="edit-lot-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as StockLotStatus)}
            className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
          >
            <option value="AVAILABLE">AVAILABLE</option>
            <option value="PARTIALLY_CONSUMED">PARTIALLY_CONSUMED</option>
            <option value="CONSUMED">CONSUMED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
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
            {isBusy ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
