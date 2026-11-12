import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  addDishMaterial,
  fetchDish,
  fetchDishMaterials,
  fetchFoodItems,
  removeDishMaterial,
  updateDishMaterial,
  setDishStatus,
  type FoodItemDropdownItem,
} from '../features/events/api/events.api';
import { Skeleton } from '../components/ui/Skeleton';
import type { DishItem, DishMaterialLine } from '../features/events/types';
import { MultiAddPanel, type MultiAddEntry } from '../features/events/components/MultiAddPanel';

export function DishDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [dish, setDish] = useState<DishItem | null>(null);
  const [materials, setMaterials] = useState<DishMaterialLine[]>([]);
  const [foodItems, setFoodItems] = useState<FoodItemDropdownItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [showAddMaterials, setShowAddMaterials] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const [dishData, materialData] = await Promise.all([fetchDish(id), fetchDishMaterials(id)]);
      setDish(dishData);
      setMaterials(materialData);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) setNotFound(true);
      else setError('Unable to load this dish.');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
    fetchFoodItems({ pageSize: 100 }).then(setFoodItems).catch(() => setFoodItems([]));
  }, [load]);

  const availableItems = foodItems
    .filter((fi) => !materials.some((m) => m.foodItem.id === fi.id))
    .map((fi) => ({
      id: fi.id,
      name: fi.name,
      stock: fi.currentStock,
      unit: fi.unit.symbol,
      unitId: fi.unit.id,
    }));

  const handleAddMaterials = async (entries: MultiAddEntry[]): Promise<void> => {
    setIsAdding(true);
    setError(null);
    const failed: string[] = [];
    let succeeded = 0;
    for (const entry of entries) {
      try {
        await addDishMaterial(id!, {
          foodItemId: entry.foodItemId,
          quantityPerPerson: Number.isFinite(entry.quantity) && entry.quantity > 0 ? entry.quantity : null,
          unitId: entry.unitId,
        });
        succeeded += 1;
      } catch {
        failed.push(foodItems.find((fi) => fi.id === entry.foodItemId)?.name ?? entry.foodItemId);
      }
    }
    const refreshed = await fetchDishMaterials(id!);
    setMaterials(refreshed);
    setIsAdding(false);
    if (failed.length > 0) {
      setError(`Could not add: ${failed.join(', ')}`);
      return;
    }
    if (succeeded > 0) setNotice(`Added ${succeeded} material${succeeded === 1 ? '' : 's'} (recipe template only — no stock deducted).`);
  };

  const updateQty = async (material: DishMaterialLine, value: string) => {
    const qty = value.trim() === '' ? null : Number.parseFloat(value);
    if (qty !== null && (!Number.isFinite(qty) || qty <= 0)) return;
    try {
      await updateDishMaterial(id!, material.id, { quantityPerPerson: qty });
      setNotice('Material updated.');
      setMaterials((prev) => prev.map((m) => (m.id === material.id ? { ...m, quantityPerPerson: qty } : m)));
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? 'Could not update the material.');
    }
  };

  const removeMaterial = async (material: DishMaterialLine) => {
    try {
      await removeDishMaterial(id!, material.id);
      setMaterials((prev) => prev.filter((m) => m.id !== material.id));
      setNotice('Material removed.');
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? 'Could not remove the material.');
    }
  };

  const toggleStatus = async () => {
    if (!dish) return;
    try {
      const updated = await setDishStatus(dish.id, !dish.isActive);
      setDish({ ...dish, isActive: updated.isActive });
      setNotice(updated.isActive ? 'Dish activated.' : 'Dish deactivated.');
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? 'Could not update status.');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading dish">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="rounded-2xl border border-border bg-card p-12 text-center">
        <h1 className="text-2xl font-bold text-ink">Dish not found</h1>
        <Link to="/dishes" className="mt-6 inline-block rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-dark">Back to Dishes</Link>
      </div>
    );
  }

  if (error && !dish) {
    return (
      <div role="alert" className="rounded-2xl border border-danger/25 bg-danger-soft p-8 text-center">
        <p className="text-base font-bold text-danger">{error}</p>
        <button type="button" onClick={() => void load()} className="mt-4 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-dark">Try Again</button>
      </div>
    );
  }

  if (!dish) return null;

  return (
    <div className="space-y-6">
      <div>
        <nav aria-label="Breadcrumb" className="text-xs font-medium text-secondary">
          <Link to="/dishes" className="hover:text-primary">Dishes</Link>
          <span aria-hidden="true" className="mx-2 text-muted">/</span>
          <span className="text-ink">{dish.name}</span>
        </nav>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{dish.name}</h1>
            <p className="mt-1 text-sm text-secondary">Recipe template — quantities are hints for event planning, never auto-calculated.</p>
          </div>
          <button type="button" onClick={() => void toggleStatus()} className={`rounded-xl border px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition ${dish.isActive ? 'border-danger/40 text-danger hover:bg-danger-soft' : 'border-emerald-300 text-emerald-800 hover:bg-emerald-50'}`}>
            {dish.isActive ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>

      {notice && <div role="status" className="rounded-xl border border-[#1e7a3c]/25 bg-[#e9f7ee] px-4 py-3 text-sm font-medium text-[#145c2c]">{notice}</div>}
      {error && <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">Dish Details</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-baseline justify-between border-b border-border/60 pb-2.5"><dt className="text-xs text-muted">Name</dt><dd className="font-medium text-ink">{dish.name}</dd></div>
            <div className="flex items-baseline justify-between border-b border-border/60 pb-2.5"><dt className="text-xs text-muted">Status</dt><dd className="font-medium text-ink">{dish.isActive ? 'Active' : 'Inactive'}</dd></div>
            <div className="flex items-baseline justify-between"><dt className="text-xs text-muted">Materials</dt><dd className="font-medium tabular-nums text-ink">{materials.length}</dd></div>
          </dl>
          {dish.description && <p className="mt-4 border-t border-border pt-4 text-sm leading-relaxed text-secondary">{dish.description}</p>}
        </section>

        <section className="xl:col-span-2 rounded-2xl border border-border bg-card shadow-sm">
          <header className="border-b border-border px-5 py-4">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">Materials (Recipe Template)</h2>
          </header>

          {materials.length === 0 ? (
            <p className="p-8 text-center text-sm text-secondary">No materials mapped yet. Add the food items this dish needs.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {materials.map((material) => (
                <li key={material.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{material.foodItem.name}</p>
                    <p className="mt-0.5 text-[11px] text-secondary">Stock: {material.foodItem.currentStock} {material.foodItem.unit.symbol}</p>
                  </div>
                  <label className="flex flex-none items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                    Per person
                    <input type="number" min={0.001} step="any" defaultValue={material.quantityPerPerson ?? ''} placeholder="—" onBlur={(e) => void updateQty(material, e.target.value)} aria-label={`Quantity per person for ${material.foodItem.name}`} className="w-20 rounded-lg border border-border-strong/70 bg-white px-2 py-1.5 text-right text-xs tabular-nums outline-none focus:border-primary" />
                    <span className="text-xs text-secondary">{material.unit.symbol}</span>
                  </label>
                  <button type="button" onClick={() => void removeMaterial(material)} aria-label={`Remove ${material.foodItem.name}`} className="flex-none rounded-lg p-1.5 text-muted transition hover:bg-red-50 hover:text-danger">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Add materials */}
          <div className="border-t border-border p-5">
            {showAddMaterials ? (
              <MultiAddPanel
                items={availableItems}
                quantityRequired={false}
                isSubmitting={isAdding}
                onSubmit={async (entries) => {
                  await handleAddMaterials(entries);
                  setShowAddMaterials(false);
                }}
                onCancel={() => setShowAddMaterials(false)}
              />
            ) : (
              <button type="button" onClick={() => setShowAddMaterials(true)} className="text-xs font-bold text-primary underline-offset-2 hover:underline">
                + Add Materials
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
