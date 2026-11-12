import { useEffect, useMemo, useState } from 'react';
import { SearchIcon, PlusIcon } from '../../../components/ui/icons';

/**
 * Multi-select "add many materials at once" panel.
 * Used in event planning (planned stock demand) and in the dish recipe template.
 * Each selected row keeps its own quantity input. Quantities are planning-only.
 */
export interface MultiAddItem {
  id: string;
  name: string;
  stock: number;
  unit: string;
  unitId?: string;
}

export interface MultiAddEntry {
  foodItemId: string;
  quantity: number;
  unitId?: string;
}

export function MultiAddPanel({
  items,
  quantityRequired = true,
  quantityLabel,
  isSubmitting,
  onSubmit,
  onCancel,
  onAddToDraft,
  autoSplitToDraft = false,
  locked = false,
  lockedMessage = 'Adding is paused until the stock shortfall is resolved.',
}: {
  items: MultiAddItem[];
  quantityRequired?: boolean;
  quantityLabel?: string;
  isSubmitting: boolean;
  onSubmit: (entries: MultiAddEntry[]) => Promise<void>;
  onCancel: () => void;
  /** When provided, enables "Add to Draft" — saves shortfall lines as uncommitted drafts. */
  onAddToDraft?: (entries: MultiAddEntry[]) => Promise<void>;
  /**
   * When true, a selected line that exceeds on-hand stock is NOT rejected —
   * it is routed to the draft automatically on submit (the caller decides per line).
   * Recipe pages keep the strict (blocking) behavior.
   */
  autoSplitToDraft?: boolean;
  /** When locked, nobody (Admin or Executor) may add items — resolve the shortfall first. */
  locked?: boolean;
  lockedMessage?: string;
}) {
  const [query, setQuery] = useState('');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If the caller removes items (e.g. after adding), prune stale selections.
    setChecked((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => items.some((item) => item.id === id))));
    setQuantities((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => items.some((item) => item.id === id))));
  }, [items]);

  const filtered = useMemo(
    () => items.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase())),
    [items, query],
  );

  const selectedCount = Object.values(checked).filter(Boolean).length;
  const entries: MultiAddEntry[] = items
    .filter((item) => checked[item.id])
    .map((item) => ({
      foodItemId: item.id,
      quantity: Number.parseFloat(quantities[item.id] ?? ''),
      unitId: item.unitId,
    }));

  // A selected item is addable ONLY when there's enough on hand.
  // Anything falling short must be stocked in first; otherwise it shows as Out of Stock.
  const shortfallById = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of entries) {
      const item = items.find((i) => i.id === entry.foodItemId);
      if (item && Number.isFinite(entry.quantity) && entry.quantity > item.stock) {
        map.set(item.id, entry.quantity - item.stock);
      }
    }
    return map;
  }, [entries, items]);
  const hasShortfall = shortfallById.size > 0;
  const allOutOfStock = items.length > 0 && items.every((item) => item.stock <= 0);

  const quantitiesValid = entries.every(
    (entry) => !quantityRequired || (Number.isFinite(entry.quantity) && entry.quantity > 0),
  );
  // With auto-split, shortfall no longer blocks submission — the caller routes those lines to draft.
  const isValid = selectedCount > 0 && quantitiesValid && (autoSplitToDraft || !hasShortfall);
  const fitCount = entries.filter((entry) => {
    const item = items.find((i) => i.id === entry.foodItemId);
    return item ? entry.quantity <= item.stock : true;
  }).length;
  const splitCount = selectedCount - fitCount;
  const canDraft = !locked && selectedCount > 0 && quantitiesValid && !isSubmitting;

  const handleAddToDraft = async () => {
    setError(null);
    if (!canDraft || !onAddToDraft) return;
    try {
      await onAddToDraft(entries);
      // Clear selections; the parent re-renders with fresh data.
      setChecked({});
      setQuantities({});
      setQuery('');
    } catch (err) {
      setError((err as Error).message || 'Could not save to draft.');
    }
  };

  const toggle = (id: string) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
    setQuantities((prev) => ({ ...prev, [id]: prev[id] ?? (quantityRequired ? '1' : '') }));
    setError(null);
  };

  const handleSubmit = async () => {
    setError(null);
    if (locked) {
      setError(lockedMessage);
      return;
    }
    if (!isValid) {
      setError(
        hasShortfall
          ? 'One or more selected items are short on stock. Stock them in first, then add them here.'
          : quantityRequired
            ? 'Enter a quantity greater than zero for each selected item.'
            : 'Select at least one item.',
      );
      return;
    }
    try {
      await onSubmit(entries);
      // Clear selections; the parent re-renders with fresh data.
      setChecked({});
      setQuantities({});
      setQuery('');
    } catch (err) {
      setError((err as Error).message || 'Could not add the selected items.');
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background" aria-disabled={locked || undefined}>
      {locked && (
        <div role="alert" className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold leading-snug text-amber-900">
          <span className="mt-0.5 flex-none font-black">!</span>
          <span>{lockedMessage}</span>
        </div>
      )}
      {/* Search */}
      <div className="border-b border-border p-2.5">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            autoFocus={!locked}
            disabled={locked}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search food items…"
            aria-label="Search food items"
            className="w-full rounded-lg border border-border-strong/60 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
      </div>

      {/* List */}
      <ul className="max-h-60 divide-y divide-border/60 overflow-y-auto">
        {filtered.length === 0 ? (
          <li className="px-4 py-6 text-center text-xs text-secondary">
            {items.length === 0
              ? 'Every food item is already added to this dish.'
              : allOutOfStock
                ? 'Everything is out of stock — stock items in first, then add them here.'
                : 'No food items match your search.'}
          </li>
        ) : (
          filtered.map((item) => {
            const isChecked = Boolean(checked[item.id]);
            const isOutOfStock = item.stock <= 0;
            const shortfall = shortfallById.get(item.id) ?? 0;
            return (
              <li key={item.id}>
                <div className={`flex items-center gap-3 px-3 py-2 transition ${isOutOfStock ? 'opacity-70' : 'hover:bg-card'}`}>
                  <input
                    type="checkbox"
                    id={`multi-add-${item.id}`}
                    checked={isChecked && !isOutOfStock && !locked}
                    disabled={isOutOfStock || locked}
                    onChange={() => toggle(item.id)}
                    className="h-4 w-4 flex-none accent-[#b84234] disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ accentColor: '#b84234' }}
                    aria-label={isOutOfStock ? `${item.name} — Out of Stock` : item.name}
                  />
                  <label htmlFor={`multi-add-${item.id}`} className={`min-w-0 flex-1 select-none ${isOutOfStock ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                    <span className="block truncate text-sm font-medium text-ink">{item.name}</span>
                    {isOutOfStock ? (
                      <span className="mt-0.5 inline-flex items-center rounded-full border border-danger/30 bg-danger-soft px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-danger">Out of Stock — stock in first</span>
                    ) : (
                      <span className="block text-[10px] text-secondary">Stock {item.stock} {item.unit}</span>
                    )}
                  </label>
                  {isChecked && !isOutOfStock && (
                    <div className="flex flex-none flex-col items-end gap-1">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={quantityRequired ? 0.001 : 0}
                          step="any"
                          aria-label={`Quantity for ${item.name}`}
                          aria-invalid={shortfall > 0}
                          placeholder={quantityRequired ? 'Qty' : 'Optional'}
                          value={quantities[item.id] ?? ''}
                          onChange={(e) => setQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          className={`w-20 rounded-lg border bg-white px-2 py-1.5 text-right text-xs tabular-nums outline-none focus:border-primary ${shortfall > 0 ? 'border-danger/60 ring-1 ring-danger/20' : 'border-border-strong/70'}`}
                        />
                        <span className="w-8 text-[10px] font-semibold text-secondary">{item.unit}</span>
                      </div>
                      {shortfall > 0 && (
                        <p role="alert" className="text-[10px] font-semibold text-danger">Short by {Math.round(shortfall * 1000) / 1000} {item.unit}</p>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })
        )}
      </ul>

      {error && <p role="alert" className="border-t border-border bg-danger-soft/40 px-3 py-2 text-[11px] font-semibold text-danger">{error}</p>}

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 border-t border-border bg-card px-3 py-2">
        <span className={`text-[11px] font-semibold ${hasShortfall && !autoSplitToDraft ? 'text-danger' : 'text-secondary'}`}>
          {locked
            ? 'Locked by stock shortfall'
            : autoSplitToDraft && selectedCount > 0 && quantitiesValid && splitCount > 0
              ? `${fitCount} will be added · ${splitCount} will go to draft (short)`
              : hasShortfall
                ? 'Insufficient stock — stock in first'
                : selectedCount === 0
                  ? 'Select items…'
                  : `${selectedCount} selected`}
        </span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCancel} disabled={isSubmitting} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-secondary transition hover:text-ink disabled:opacity-50">
            Cancel
          </button>
          {onAddToDraft && (
            <button
              type="button"
              onClick={() => void handleAddToDraft()}
              disabled={!canDraft}
              title={hasShortfall ? 'Stock is short — save these as draft and add them once stock arrives' : 'Save as draft instead of adding now'}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400 bg-amber-50 px-3.5 py-1.5 text-xs font-bold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add to Draft
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!isValid || isSubmitting || locked}
            title={autoSplitToDraft && splitCount > 0 ? 'Short items will be saved to the draft automatically' : undefined}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-foreground transition hover:bg-primary-dark disabled:opacity-50"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            {isSubmitting ? (quantityLabel ?? 'Adding') + '…' : `Add ${selectedCount || ''} Material${selectedCount === 1 ? '' : 's'}`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}
