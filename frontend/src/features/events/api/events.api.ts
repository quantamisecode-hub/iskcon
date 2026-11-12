import {
  API_ENDPOINTS,
  dishMaterialPath,
  dishMaterialsPath,
  dishPath,
  dishStatusPath,
  eventCancelPath,
  eventDishMaterialPath,
  eventDishMaterialsPath,
  eventDishPath,
  eventDishesPath,
  eventMaterialSummaryPath,
  eventPath,
  eventStatusPath,
} from '../../../constants/apiEndpoints';
import { apiClient } from '../../../services/api/apiClient';
import type { ApiSuccess } from '../../../types/api';
import type {
  CalendarEvent,
  DishItem,
  DishMaterialLine,
  EventDetail,
  EventDishItem,
  EventsPage,
  FoodItemRef,
  UnitRef,
} from '../types';

/**
 * Phase 4 API layer: events, event dishes, event materials, calendar, dishes.
 * PLANNING ONLY - no endpoint here deducts inventory stock.
 */

export interface FoodItemListResponse {
  foodItems: {
    id: string;
    name: string;
    minimumStock: number;
    reorderLevel: number;
    isActive: boolean;
    unitId: string;
  }[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UnitListResponse {
  units: { id: string; name: string; symbol: string; isActive: boolean }[];
  total: number;
  page: number;
  pageSize: number;
}

type FoodItemWithStock = FoodItemListResponse['foodItems'][number] & {
  unit?: { id?: string; symbol: string; name: string };
  inventory?: { currentQuantity: number } | null;
};

export type FoodItemDropdownItem = FoodItemWithStock & {
  unit: { id?: string; symbol: string; name: string };
  currentStock: number;
};

export interface EventFilters {
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

/** GET /api/v1/events */
export async function fetchEvents(filters: EventFilters): Promise<EventsPage> {
  const params: Record<string, string | number> = {};
  if (filters.search) params['search'] = filters.search;
  if (filters.status) params['status'] = filters.status;
  if (filters.dateFrom) params['dateFrom'] = filters.dateFrom;
  if (filters.dateTo) params['dateTo'] = filters.dateTo;
  if (filters.page) params['page'] = filters.page;
  if (filters.pageSize) params['pageSize'] = filters.pageSize;
  const response = await apiClient.get<ApiSuccess<EventsPage>>(API_ENDPOINTS.events, { params });
  return response.data.data;
}

/** GET /api/v1/events/:id */
export async function fetchEvent(id: string): Promise<EventDetail> {
  const response = await apiClient.get<ApiSuccess<EventDetail>>(eventPath(id));
  return response.data.data;
}

export interface CreateEventPayload {
  name: string;
  description?: string | null;
  eventDate: string;
  startTime: string;
  endTime?: string | null;
  numberOfPeople: number;
  location?: string | null;
  notes?: string | null;
  /** Only DRAFT | PLANNING are accepted at creation; further transitions go through the status machine. */
  status?: 'DRAFT' | 'PLANNING';
}

/** POST /api/v1/events */
export async function createEvent(payload: CreateEventPayload): Promise<EventDetail> {
  const response = await apiClient.post<ApiSuccess<EventDetail>>(API_ENDPOINTS.events, payload);
  return response.data.data;
}

/** PATCH /api/v1/events/:id */
export async function updateEvent(id: string, payload: Partial<CreateEventPayload>): Promise<EventDetail> {
  const response = await apiClient.patch<ApiSuccess<EventDetail>>(eventPath(id), payload);
  return response.data.data;
}

/** PATCH /api/v1/events/:id/status */
export async function changeEventStatus(id: string, status: string): Promise<EventDetail> {
  const response = await apiClient.patch<ApiSuccess<EventDetail>>(eventStatusPath(id), { status });
  return response.data.data;
}

/** DELETE /api/v1/events/:id */
export async function deleteEvent(id: string): Promise<void> {
  await apiClient.delete(eventPath(id));
}

/**
 * POST /api/v1/events/:id/cancel — ADMIN only, reason mandatory (Phase 7
 * extension §28–§34). Cancels every request with zero issued quantity; issued
 * history survives so material can still be returned. Never moves stock.
 */
export async function cancelEvent(id: string, reason: string): Promise<EventDetail> {
  const response = await apiClient.post<ApiSuccess<EventDetail>>(eventCancelPath(id), { reason });
  return response.data.data;
}

// ---------------- Event material summary (§39/§40/§47) ----------------

export interface EventMaterialSummaryLine {
  foodItemId: string;
  foodItemName: string;
  unitSymbol: string;
  unitName: string;
  dishIds: string[];
  plannedQuantity: number;
  requestedQuantity: number;
  approvedQuantity: number;
  rejectedQuantity: number;
  issuedQuantity: number;
  returnedQuantity: number;
  pendingApprovalQuantity: number;
  pendingIssueQuantity: number;
  /** §39 "Unreturned Issued Quantity" — physical stock still out there. */
  returnableQuantity: number;
  availableStock: number;
  isActive: boolean;
  hasPlan: boolean;
}

export type EventLifecycleStatus =
  | 'PLANNED'
  | 'REQUESTED'
  | 'APPROVAL_PENDING'
  | 'ISSUE_PENDING'
  | 'RETURN_RECONCILIATION_PENDING'
  | 'FULLY_ISSUED'
  | 'CANCELLED';

export interface EventMaterialSummary {
  eventId: string;
  eventCode: string;
  eventName: string;
  eventDate: string;
  eventStatus: string;
  lifecycleStatus: EventLifecycleStatus;
  cancellation: { reason: string | null; cancelledAt: string | null };
  lines: EventMaterialSummaryLine[];
  totals: Omit<EventMaterialSummaryLine, 'foodItemId' | 'foodItemName' | 'unitSymbol' | 'unitName' | 'dishIds' | 'availableStock' | 'isActive' | 'hasPlan'>;
  generatedAt: string;
}

/** GET /api/v1/events/:id/material-summary — computed, never stored. */
export async function fetchEventMaterialSummary(id: string): Promise<EventMaterialSummary> {
  const response = await apiClient.get<ApiSuccess<EventMaterialSummary>>(eventMaterialSummaryPath(id));
  return response.data.data;
}

// ---------------- Event dishes ----------------

/** POST /api/v1/events/:eventId/dishes — returns the FULL updated event. */
export async function addEventDish(eventId: string, dishId: string, notes?: string | null): Promise<EventDetail> {
  const response = await apiClient.post<ApiSuccess<EventDetail>>(eventDishesPath(eventId), {
    dishId,
    notes: notes ?? null,
  });
  return response.data.data;
}

/** PATCH /api/v1/events/:eventId/dishes/:eventDishId */
export async function updateEventDish(
  eventId: string,
  eventDishId: string,
  payload: { displayOrder?: number; notes?: string | null },
): Promise<EventDetail> {
  const response = await apiClient.patch<ApiSuccess<EventDetail>>(eventDishPath(eventId, eventDishId), payload);
  return response.data.data;
}

/** DELETE /api/v1/events/:eventId/dishes/:eventDishId */
export async function removeEventDish(eventId: string, eventDishId: string): Promise<EventDetail> {
  const response = await apiClient.delete<ApiSuccess<EventDetail>>(eventDishPath(eventId, eventDishId));
  return response.data.data;
}

// ---------------- Event materials ----------------

/** POST /api/v1/event-dishes/:eventDishId/materials — returns FULL updated event. */
export async function addEventMaterial(
  eventDishId: string,
  payload: { foodItemId: string; plannedQuantity: number; unitId?: string; notes?: string | null; isDraft?: boolean },
): Promise<EventDetail> {
  const response = await apiClient.post<ApiSuccess<EventDetail>>(eventDishMaterialsPath(eventDishId), payload);
  return response.data.data;
}

/** PATCH /api/v1/event-dishes/:eventDishId/materials/:materialId */
export async function updateEventMaterial(
  eventDishId: string,
  materialId: string,
  payload: { plannedQuantity?: number; unitId?: string; notes?: string | null; isDraft?: boolean },
): Promise<EventDetail> {
  const response = await apiClient.patch<ApiSuccess<EventDetail>>(eventDishMaterialPath(eventDishId, materialId), payload);
  return response.data.data;
}

/** DELETE /api/v1/event-dishes/:eventDishId/materials/:materialId */
export async function removeEventMaterial(eventDishId: string, materialId: string): Promise<EventDetail> {
  const response = await apiClient.delete<ApiSuccess<EventDetail>>(eventDishMaterialPath(eventDishId, materialId));
  return response.data.data;
}

// ---------------- Calendar ----------------

/** GET /api/v1/calendar/events?from=&to= */
export async function fetchCalendarEvents(from: string, to: string): Promise<CalendarEvent[]> {
  const response = await apiClient.get<ApiSuccess<{ events: CalendarEvent[] }>>(API_ENDPOINTS.calendarEvents, {
    params: { from, to },
  });
  return response.data.data.events;
}

// ---------------- Dishes (master) ----------------

export interface DishFilters {
  search?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export interface DishesPageResponse {
  dishes: DishItem[];
  total: number;
  page: number;
  pageSize: number;
}

interface RawDishItem extends Omit<DishItem, 'materialsCount' | 'eventsCount'> {
  _count?: { materials: number; events: number };
}

/** GET /api/v1/dishes */
export async function fetchDishes(filters: DishFilters = {}): Promise<DishesPageResponse> {
  const params: Record<string, string | number | boolean> = {};
  if (filters.search) params['search'] = filters.search;
  if (filters.isActive !== undefined) params['isActive'] = filters.isActive;
  if (filters.page) params['page'] = filters.page;
  if (filters.pageSize) params['pageSize'] = filters.pageSize;
  const response = await apiClient.get<
    ApiSuccess<{ dishes: RawDishItem[]; total: number; page: number; pageSize: number }>
  >(API_ENDPOINTS.dishes, { params });
  const { dishes, total, page, pageSize } = response.data.data;
  return {
    dishes: dishes.map(({ _count, ...dish }) => ({
      ...dish,
      materialsCount: _count?.materials ?? 0,
      eventsCount: _count?.events ?? 0,
    })),
    total,
    page,
    pageSize,
  };
}

/** GET /api/v1/dishes/:id (includes materials with food item info) */
export async function fetchDish(id: string): Promise<DishItem> {
  const response = await apiClient.get<ApiSuccess<DishItem>>(dishPath(id));
  return response.data.data;
}

/** POST /api/v1/dishes */
export async function createDish(payload: { name: string; description?: string | null }): Promise<DishItem> {
  const response = await apiClient.post<ApiSuccess<DishItem>>(API_ENDPOINTS.dishes, payload);
  return response.data.data;
}

/** PATCH /api/v1/dishes/:id */
export async function updateDish(id: string, payload: { name?: string; description?: string | null }): Promise<DishItem> {
  const response = await apiClient.patch<ApiSuccess<DishItem>>(dishPath(id), payload);
  return response.data.data;
}

/** PATCH /api/v1/dishes/:id/status */
export async function setDishStatus(id: string, isActive: boolean): Promise<DishItem> {
  const response = await apiClient.patch<ApiSuccess<DishItem>>(dishStatusPath(id), { isActive });
  return response.data.data;
}

interface RawFoodItemRef {
  id: string;
  name: string;
  minimumStock: number;
  reorderLevel: number;
  isActive: boolean;
  unit: { id?: string; symbol: string; name: string };
  inventory?: { currentQuantity: number } | null;
}

interface RawDishMaterialLine {
  id: string;
  quantityPerPerson: number | null;
  unit: UnitRef;
  foodItem: RawFoodItemRef;
}

function mapFoodItemRef(raw: RawFoodItemRef): FoodItemRef {
  const { inventory, ...rest } = raw;
  return { ...rest, currentStock: inventory?.currentQuantity ?? 0 };
}

function mapDishMaterialLine(raw: RawDishMaterialLine): DishMaterialLine {
  return {
    id: raw.id,
    quantityPerPerson: raw.quantityPerPerson,
    unit: raw.unit,
    foodItem: mapFoodItemRef(raw.foodItem),
  };
}

/** GET /api/v1/dishes/:id/materials (ADMIN) */
export async function fetchDishMaterials(dishId: string): Promise<DishMaterialLine[]> {
  const response = await apiClient.get<ApiSuccess<{ materials: RawDishMaterialLine[] }>>(dishMaterialsPath(dishId));
  return response.data.data.materials.map(mapDishMaterialLine);
}

/** POST /api/v1/dishes/:id/materials (ADMIN) */
export async function addDishMaterial(
  dishId: string,
  payload: { foodItemId: string; quantityPerPerson?: number | null; unitId?: string },
): Promise<DishMaterialLine> {
  const response = await apiClient.post<ApiSuccess<RawDishMaterialLine>>(dishMaterialsPath(dishId), payload);
  return mapDishMaterialLine(response.data.data);
}

/** PATCH /api/v1/dishes/:id/materials/:materialId (ADMIN) */
export async function updateDishMaterial(
  dishId: string,
  materialId: string,
  payload: { quantityPerPerson?: number | null; unitId?: string },
): Promise<DishMaterialLine> {
  const response = await apiClient.patch<ApiSuccess<RawDishMaterialLine>>(dishMaterialPath(dishId, materialId), payload);
  return mapDishMaterialLine(response.data.data);
}

/** DELETE /api/v1/dishes/:id/materials/:materialId (ADMIN) */
export async function removeDishMaterial(dishId: string, materialId: string): Promise<void> {
  await apiClient.delete(dishMaterialPath(dishId, materialId));
}

// ---------------- Food items / units (read-only dropdowns) ----------------

/**
 * EventDishItem is re-exported so feature pages can import all event types
 * from one place (the API module) instead of reaching into types.ts directly.
 */
export type { EventDishItem };

/** GET /api/v1/food-items — read access for every role (dropdowns). */
export async function fetchFoodItems(params: { search?: string; pageSize?: number } = {}): Promise<FoodItemDropdownItem[]> {
  const response = await apiClient.get<
    ApiSuccess<{ foodItems: FoodItemWithStock[]; total: number; page: number; pageSize: number }>
  >(API_ENDPOINTS.foodItems, {
    params: { pageSize: params.pageSize ?? 100, ...(params.search ? { search: params.search } : {}) },
  });
  const items = response.data.data.foodItems;
  return items.map((item) => ({
    ...item,
    unit: item.unit ?? { symbol: '—', name: '—' },
    currentStock: item.inventory?.currentQuantity ?? 0,
  }));
}

/** GET /api/v1/units — read access for every role. */
export async function fetchUnits(pageSize = 100): Promise<UnitListResponse['units']> {
  const response = await apiClient.get<ApiSuccess<UnitListResponse>>(API_ENDPOINTS.units, {
    params: { pageSize },
  });
  return response.data.data.units;
}
