import { API_ENDPOINTS, fifoPreviewPath, inventoryValuationPath, stockLotPath, vendorActivatePath, vendorAuditPath, vendorDeactivatePath, vendorPath } from '../../../constants/apiEndpoints';
import { APP_CONSTANTS } from '../../../constants/appConstants';
import { apiClient } from '../../../services/api/apiClient';
import type { ApiSuccess } from '../../../types/api';

/**
 * The ONLY money formatter in the UI. Currency/locale come from APP_CONSTANTS
 * so components never hardcode a symbol or a locale. Financial values are
 * ADMIN-only; callers on shared pages must gate with `isAdmin`.
 */
export function formatINR(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(APP_CONSTANTS.currency.locale, {
    style: 'currency',
    currency: APP_CONSTANTS.currency.code,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Inventory API layer (read + stock mutations through the backend only).
 * The frontend NEVER computes new balances locally.
 */

export interface CategoryRef {
  id: string;
  name: string;
}
export interface UnitRefFull {
  id: string;
  name: string;
  symbol: string;
  unitType?: string;
}

export interface FoodItemRow {
  id: string;
  name: string;
  description: string | null;
  minimumStock: number;
  reorderLevel: number;
  isActive: boolean;
  categoryId: string;
  unitId: string;
  unit: UnitRefFull;
  category: CategoryRef;
  inventory?: { currentQuantity: number; updatedAt?: string } | null;
}

export interface StockSummary {
  totalItems: number;
  totalStockLines: number;
  lowStock: number;
  reorderRequired: number;
  outOfStock: number;
  healthy: number;
}

export async function fetchStockSummary(): Promise<StockSummary> {
  const response = await apiClient.get<ApiSuccess<StockSummary>>(`${API_ENDPOINTS.foodItems}/stock/summary`);
  return response.data.data;
}

export interface FoodItemsPage {
  foodItems: FoodItemRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface FoodItemFilters {
  search?: string;
  categoryId?: string;
  unitId?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export async function fetchFoodItemsList(filters: FoodItemFilters = {}): Promise<FoodItemsPage> {
  const params: Record<string, string | number | boolean> = {};
  if (filters.search) params['search'] = filters.search;
  if (filters.categoryId) params['categoryId'] = filters.categoryId;
  if (filters.unitId) params['unitId'] = filters.unitId;
  if (filters.isActive !== undefined) params['isActive'] = filters.isActive;
  if (filters.page) params['page'] = filters.page;
  if (filters.pageSize) params['pageSize'] = filters.pageSize;
  const response = await apiClient.get<ApiSuccess<FoodItemsPage>>(API_ENDPOINTS.foodItems, { params });
  return response.data.data;
}

export interface CreateFoodItemPayload {
  name: string;
  description?: string;
  categoryName: string;
  unitSymbol: string;
  minimumStock: number;
  reorderLevel: number;
}

export async function createFoodItem(payload: CreateFoodItemPayload): Promise<FoodItemRow> {
  const response = await apiClient.post<ApiSuccess<FoodItemRow>>(API_ENDPOINTS.foodItems, payload);
  return response.data.data;
}

export async function updateFoodItem(id: string, payload: Partial<CreateFoodItemPayload & { isActive: boolean }>): Promise<FoodItemRow> {
  const response = await apiClient.patch<ApiSuccess<FoodItemRow>>(`${API_ENDPOINTS.foodItems}/${id}`, payload);
  return response.data.data;
}

/** Optional lot metadata captured at Stock In. Total cost is computed server-side. */
export interface StockInDetails {
  purchaseDate?: string;
  receivedDate?: string;
  unitCost?: number;
  referenceNumber?: string;
  notes?: string;
}

export async function stockIn(
  id: string,
  quantity: number,
  vendorId?: string | null,
  details?: StockInDetails,
): Promise<{ inventory: { currentQuantity: number } }> {
  const body: Record<string, unknown> = { quantity };
  if (vendorId !== undefined) body['vendorId'] = vendorId;
  if (details) {
    if (details.purchaseDate) body['purchaseDate'] = details.purchaseDate;
    if (details.receivedDate) body['receivedDate'] = details.receivedDate;
    if (details.unitCost !== undefined) body['unitCost'] = details.unitCost;
    if (details.referenceNumber) body['referenceNumber'] = details.referenceNumber;
    if (details.notes) body['notes'] = details.notes;
  }
  const response = await apiClient.post<ApiSuccess<{ inventory: { currentQuantity: number } }>>(`${API_ENDPOINTS.foodItems}/${id}/stock-in`, body);
  return response.data.data;
}

export interface StockOutMeta {
  reason: string;
  referenceType?: 'EVENT';
  referenceId?: string | null;
}

/** POST /api/v1/food-items/:id/stock-out — real stock consumption with mandatory reason. */
export async function stockOut(id: string, quantity: number, meta: StockOutMeta): Promise<{ inventory: { currentQuantity: number } }> {
  const body: Record<string, unknown> = { quantity, reason: meta.reason };
  if (meta.referenceType) {
    body['referenceType'] = meta.referenceType;
    body['referenceId'] = meta.referenceId ?? null;
  }
  const response = await apiClient.post<ApiSuccess<{ inventory: { currentQuantity: number } }>>(`${API_ENDPOINTS.foodItems}/${id}/stock-out`, body);
  return response.data.data;
}

// ---------------- Categories ----------------

export interface CategoryRow {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface CategoriesPage {
  categories: CategoryRow[];
  total: number;
  page: number;
  pageSize: number;
}

export async function fetchCategories(filters: { search?: string; isActive?: boolean; page?: number; pageSize?: number } = {}): Promise<CategoriesPage> {
  const params: Record<string, string | number | boolean> = {};
  if (filters.search) params['search'] = filters.search;
  if (filters.isActive !== undefined) params['isActive'] = filters.isActive;
  if (filters.page) params['page'] = filters.page;
  if (filters.pageSize) params['pageSize'] = filters.pageSize;
  const response = await apiClient.get<ApiSuccess<CategoriesPage>>('/categories', { params });
  return response.data.data;
}

export async function createCategory(payload: { name: string; description?: string }): Promise<CategoryRow> {
  const response = await apiClient.post<ApiSuccess<CategoryRow>>('/categories', payload);
  return response.data.data;
}

export async function updateCategory(id: string, payload: { name?: string; description?: string; isActive?: string | boolean }): Promise<CategoryRow> {
  const response = await apiClient.patch<ApiSuccess<CategoryRow>>(`/categories/${id}`, payload);
  return response.data.data;
}

/**
 * Hard-delete a category. Refused with 409 while any food item references it —
 * the server message explains what to move first.
 */
export async function deleteCategory(id: string): Promise<void> {
  await apiClient.delete(`/categories/${id}`);
}

// ---------------- Vendors ----------------

export interface VendorRow {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  gstNumber: string | null;
  paymentTerms: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VendorsPage {
  vendors: VendorRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** Fields accepted by the create/update vendor endpoints. */
export interface VendorPayload {
  name: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  gstNumber?: string | null;
  paymentTerms?: string | null;
  notes?: string | null;
  isActive?: boolean | string;
}

export async function fetchVendors(filters: { search?: string; isActive?: boolean | string; page?: number; pageSize?: number } = {}): Promise<VendorsPage> {
  const params: Record<string, string | number | boolean> = {};
  if (filters.search) params['search'] = filters.search;
  if (filters.isActive !== undefined) params['isActive'] = filters.isActive;
  if (filters.page) params['page'] = filters.page;
  if (filters.pageSize) params['pageSize'] = filters.pageSize;
  const response = await apiClient.get<ApiSuccess<VendorsPage>>(API_ENDPOINTS.vendors, { params });
  return response.data.data;
}

export async function fetchVendor(id: string): Promise<VendorRow> {
  const response = await apiClient.get<ApiSuccess<VendorRow>>(vendorPath(id));
  return response.data.data;
}

export async function createVendor(payload: VendorPayload): Promise<VendorRow> {
  const response = await apiClient.post<ApiSuccess<VendorRow>>(API_ENDPOINTS.vendors, payload);
  return response.data.data;
}

export async function updateVendor(id: string, payload: Partial<VendorPayload>): Promise<VendorRow> {
  const response = await apiClient.patch<ApiSuccess<VendorRow>>(vendorPath(id), payload);
  return response.data.data;
}

/** Soft-deactivate a vendor — stock history is preserved. */
export async function deleteVendor(id: string): Promise<void> {
  await apiClient.delete(vendorPath(id));
}

/** One audit-history row for vendor create/update/activate/deactivate actions. */
export interface VendorAuditEntry {
  id: string;
  action: string;
  entityId: string | null;
  actorName: string | null;
  createdAt: string;
  oldValues: unknown;
  newValues: unknown;
}

/** ADMIN-only: GET /vendors/audit (all) or /vendors/:id/audit (one vendor). */
export async function fetchVendorAudit(id?: string): Promise<VendorAuditEntry[]> {
  const response = await apiClient.get<ApiSuccess<VendorAuditEntry[]>>(vendorAuditPath(id));
  return response.data.data;
}

/** ADMIN-only: POST /vendors/:id/activate — returns the reactivated vendor. */
export async function activateVendor(id: string): Promise<VendorRow> {
  const response = await apiClient.post<ApiSuccess<VendorRow>>(vendorActivatePath(id));
  return response.data.data;
}

/** ADMIN-only: POST /vendors/:id/deactivate — returns the deactivated vendor. */
export async function deactivateVendor(id: string): Promise<VendorRow> {
  const response = await apiClient.post<ApiSuccess<VendorRow>>(vendorDeactivatePath(id));
  return response.data.data;
}

// ---------------- Units ----------------

export interface UnitRow {
  id: string;
  name: string;
  symbol: string;
  unitType: string;
  isActive: boolean;
  createdAt: string;
}

export interface UnitsPage {
  units: UnitRow[];
  total: number;
  page: number;
  pageSize: number;
}

export async function fetchUnitsList(filters: { search?: string; isActive?: boolean; page?: number; pageSize?: number } = {}): Promise<UnitsPage> {
  const params: Record<string, string | number | boolean> = {};
  if (filters.search) params['search'] = filters.search;
  if (filters.isActive !== undefined) params['isActive'] = filters.isActive;
  if (filters.page) params['page'] = filters.page;
  if (filters.pageSize) params['pageSize'] = filters.pageSize;
  const response = await apiClient.get<ApiSuccess<UnitsPage>>('/units', { params });
  return response.data.data;
}

export async function createUnit(payload: { name: string; symbol: string; unitType: string }): Promise<UnitRow> {
  const response = await apiClient.post<ApiSuccess<UnitRow>>('/units', payload);
  return response.data.data;
}

export async function updateUnit(id: string, payload: { name?: string; symbol?: string; unitType?: string; isActive?: string | boolean }): Promise<UnitRow> {
  const response = await apiClient.patch<ApiSuccess<UnitRow>>(`/units/${id}`, payload);
  return response.data.data;
}

// ---------------- FIFO lots, preview & valuation (ADMIN only) ----------------

export type StockLotStatus = 'AVAILABLE' | 'PARTIALLY_CONSUMED' | 'CONSUMED' | 'CANCELLED';

export interface StockLotRow {
  id: string;
  lotNumber: string;
  foodItemId: string;
  foodItemName: string;
  vendorId: string | null;
  vendorName: string | null;
  purchaseDate: string | null;
  receivedDate: string;
  quantityReceived: number;
  quantityRemaining: number;
  unitCost: number | null;
  totalCost: number | null;
  status: StockLotStatus;
  referenceType: string | null;
  createdAt: string;
}

export interface StockAllocationRow {
  id: string;
  stockLotId: string;
  quantityAllocated: number;
  unitCost: number | null;
  totalCost: number | null;
  createdAt: string;
  requestId?: string | null;
  eventId?: string | null;
  transactionId?: string | null;
}

export interface StockLotDetail extends StockLotRow {
  allocations: StockAllocationRow[];
}

export interface StockLotPage {
  lots: StockLotRow[];
  total: number;
  page: number;
  pageSize: number;
  inventoryValue: number;
}

export interface StockLotFilters {
  foodItemId?: string;
  vendorId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchStockLots(filters: StockLotFilters = {}): Promise<StockLotPage> {
  const params: Record<string, string | number> = {};
  if (filters.foodItemId) params['foodItemId'] = filters.foodItemId;
  if (filters.vendorId) params['vendorId'] = filters.vendorId;
  if (filters.status) params['status'] = filters.status;
  if (filters.page) params['page'] = filters.page;
  if (filters.pageSize) params['pageSize'] = filters.pageSize;
  const response = await apiClient.get<ApiSuccess<StockLotPage>>(stockLotPath(), { params });
  return response.data.data;
}

export async function fetchStockLot(id: string): Promise<StockLotDetail> {
  const response = await apiClient.get<ApiSuccess<StockLotDetail>>(stockLotPath(id));
  return response.data.data;
}

export interface FifoPreviewAllocation {
  lotNumber: string;
  vendorName: string | null;
  receivedDate: string;
  quantityAllocated: number;
  unitCost: number | null;
  totalCost: number | null;
}

export interface FifoPreview {
  foodItemId: string;
  requestedQuantity: number;
  availableQuantity: number;
  allocations: FifoPreviewAllocation[];
  totalCost: number | null;
  averageCost: number | null;
  sufficient: boolean;
}

export async function fetchFifoPreview(foodItemId: string, quantity: number): Promise<FifoPreview> {
  const response = await apiClient.get<ApiSuccess<FifoPreview>>(fifoPreviewPath(), {
    params: { foodItemId, quantity },
  });
  return response.data.data;
}

export interface InventoryValuation {
  totalValue: number;
  byItem: Array<{ foodItemId: string; name: string; quantity: number; value: number }>;
}

export async function fetchInventoryValuation(): Promise<InventoryValuation> {
  const response = await apiClient.get<ApiSuccess<InventoryValuation>>(inventoryValuationPath());
  return response.data.data;
}

// ---------------- Ledger ----------------

export interface LedgerRow {
  id: string;
  createdAt: string;
  item: string;
  foodItemId?: string;
  unit: string;
  transactionType: 'STOCK_IN' | 'STOCK_OUT' | 'ADJUSTMENT' | 'RETURN';
  quantity: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  /** Human label for the reference (requestCode / returnCode / event code) — never a raw UUID. */
  referenceLabel?: string | null;
  remarks: string | null;
  performedBy: string;
  performedById?: string | null;
  /** Vendor credited on a STOCK_IN — null for other transaction types. */
  vendor?: { id: string; name: string } | null;
  /** FIFO cost provenance — all present on lot-backed movements. */
  unitCost: number | null;
  totalCost: number | null;
  stockLotId: string | null;
  lotNumber: string | null;
}

export interface LedgerPage {
  transactions: LedgerRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LedgerFilters {
  itemId?: string;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchLedger(filters: LedgerFilters = {}): Promise<LedgerPage> {
  const params: Record<string, string | number> = {};
  if (filters.itemId) params['itemId'] = filters.itemId;
  if (filters.type) params['type'] = filters.type;
  if (filters.dateFrom) params['dateFrom'] = filters.dateFrom;
  if (filters.dateTo) params['dateTo'] = filters.dateTo;
  if (filters.page) params['page'] = filters.page;
  if (filters.pageSize) params['pageSize'] = filters.pageSize;
  const response = await apiClient.get<ApiSuccess<LedgerPage>>(API_ENDPOINTS.ledger, { params });
  return response.data.data;
}

export async function fetchLedgerEntry(id: string): Promise<LedgerRow> {
  const response = await apiClient.get<ApiSuccess<LedgerRow>>(`${API_ENDPOINTS.ledger}/${id}`);
  return response.data.data;
}

// ---------------- Stock summary + Item detail (Phase 6) ----------------

export interface FoodItemDetail {
  foodItem: FoodItemRow;
  inventory: { currentQuantity: number } | null;
  currentQuantity: number;
  status: 'NORMAL' | 'LOW' | 'CRITICAL' | 'OUT_OF_STOCK';
  stockSummary: { currentQuantity: number; minimumStock: number; reorderLevel: number };
  recentTransactions: Array<{
    id: string;
    transactionType: string;
    quantity: number;
    balanceBefore: number;
    balanceAfter: number;
    referenceType: string | null;
    referenceId: string | null;
    remarks: string | null;
    performedBy: string | null;
    createdAt: string;
  }>;
  relatedEvents: Array<{ eventId: string; eventName: string; eventCode: string; eventDate: string; plannedQuantity: number }>;
  relatedRequests: Array<{ requestId: string; requestCode: string; status: string; createdAt: string; quantity: number }>;
}

export async function fetchFoodItemDetail(id: string): Promise<FoodItemDetail> {
  const response = await apiClient.get<ApiSuccess<FoodItemDetail>>(`${API_ENDPOINTS.foodItems}/${id}/detail`);
  return response.data.data;
}
