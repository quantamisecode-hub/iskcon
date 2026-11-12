import { API_ENDPOINTS } from '../../../constants/apiEndpoints';
import { apiClient } from '../../../services/api/apiClient';
import type { ApiSuccess } from '../../../types/api';

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

export async function stockIn(id: string, quantity: number): Promise<{ inventory: { currentQuantity: number } }> {
  const response = await apiClient.post<ApiSuccess<{ inventory: { currentQuantity: number } }>>(`${API_ENDPOINTS.foodItems}/${id}/stock-in`, { quantity });
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
  const response = await apiClient.get<ApiSuccess<LedgerPage>>('/ledger', { params });
  return response.data.data;
}

export async function fetchLedgerEntry(id: string): Promise<LedgerRow> {
  const response = await apiClient.get<ApiSuccess<LedgerRow>>(`/ledger/${id}`);
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
