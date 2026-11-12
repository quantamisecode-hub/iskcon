import { API_ENDPOINTS, eventMaterialRequestsPath } from '../../../constants/apiEndpoints';
import { apiClient } from '../../../services/api/apiClient';
import type { ApiSuccess } from '../../../types/api';

export type MaterialRequestStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'PARTIALLY_ISSUED'
  | 'ISSUED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'CANCELLED_BY_EVENT';

export type MaterialRequestItemStatus = 'REQUESTED' | 'APPROVED' | 'PARTIALLY_ISSUED' | 'ISSUED' | 'REJECTED' | 'CANCELLED' | 'CANCELLED_BY_EVENT';

/** Phase 7 extension: INITIAL vs ADDITIONAL (a separate request row, never a mutation). */
export type MaterialRequestType = 'INITIAL' | 'ADDITIONAL';

export interface RequestItemView {
  id: string;
  foodItemId: string;
  foodItemName: string;
  categoryName?: string;
  dishId?: string | null;
  dishName?: string | null;
  plannedQuantity: number;
  requestedQuantity: number;
  approvedQuantity: number;
  issuedQuantity: number;
  rejectedQuantity: number;
  pendingQuantity: number;
  itemStatus: MaterialRequestItemStatus;
  remarks?: string | null;
  unitSymbol: string;
  unitName: string;
  availableStock?: number;
  sourceEventMaterialId?: string | null;
  unit?: { id: string; symbol: string; name: string };
}

export interface RequestTimelineEntry {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  message: string;
  metadata?: unknown;
  actorId: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface MaterialRequest {
  id: string;
  requestCode: string;
  eventId: string;
  event: { id: string; name: string; eventCode: string; eventDate: string; numberOfPeople?: number; adminId?: string; status?: string };
  requestedBy: { id: string; firstName: string; lastName: string; email?: string };
  admin: { id: string; firstName: string; lastName: string; email?: string };
  approver?: { id: string; firstName: string; lastName: string } | null;
  requestedById: string;
  adminId: string;
  status: MaterialRequestStatus;
  /** Phase 7 extension — never merged with the concept of a return or an issue. */
  requestType: MaterialRequestType;
  parentRequestId?: string | null;
  parent?: { id: string; requestCode: string; status: string; requestType: MaterialRequestType } | null;
  reason?: string | null;
  notes?: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  issuedAt?: string | null;
  rejectionReason?: string | null;
  approverId?: string | null;
  createdAt: string;
  updatedAt: string;
  items: RequestItemView[];
  timeline?: RequestTimelineEntry[];
}

export interface RequestsPageResult {
  requests: MaterialRequest[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RequestsFilters {
  status?: string;
  eventId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

function params(filters: RequestsFilters) {
  const p: Record<string, string | number> = {};
  if (filters.status) p['status'] = filters.status;
  if (filters.eventId) p['eventId'] = filters.eventId;
  if (filters.search) p['search'] = filters.search;
  if (filters.page) p['page'] = filters.page;
  if (filters.pageSize) p['pageSize'] = filters.pageSize;
  if (filters.sort) p['sort'] = filters.sort;
  if (filters.order) p['order'] = filters.order;
  return p;
}

export async function fetchMaterialRequests(filters: RequestsFilters = {}): Promise<RequestsPageResult> {
  const resp = await apiClient.get<ApiSuccess<RequestsPageResult>>(API_ENDPOINTS.materialRequests, { params: params(filters) });
  return resp.data.data;
}

export async function fetchMaterialRequest(id: string): Promise<MaterialRequest> {
  const resp = await apiClient.get<ApiSuccess<{ request: MaterialRequest }>>(`${API_ENDPOINTS.materialRequests}/${id}`);
  return resp.data.data.request;
}

export async function createMaterialRequest(payload: {
  eventId: string;
  notes?: string | null;
  items?: Array<{ eventMaterialId: string; requestedQuantity: number; remarks?: string | null }>;
}): Promise<MaterialRequest> {
  const resp = await apiClient.post<ApiSuccess<{ request: MaterialRequest }>>(API_ENDPOINTS.materialRequests, payload);
  return resp.data.data.request;
}

export async function submitMaterialRequest(id: string): Promise<MaterialRequest> {
  const resp = await apiClient.post<ApiSuccess<{ request: MaterialRequest }>>(`${API_ENDPOINTS.materialRequests}/${id}/submit`);
  return resp.data.data.request;
}

export async function approveMaterialRequest(id: string, items?: Array<{ itemId: string; approvedQuantity: number }>): Promise<MaterialRequest> {
  const resp = await apiClient.post<ApiSuccess<{ request: MaterialRequest }>>(
    `${API_ENDPOINTS.materialRequests}/${id}/approve`,
    items ? { items } : {},
  );
  return resp.data.data.request;
}

export async function rejectMaterialRequest(id: string, reason: string): Promise<MaterialRequest> {
  const resp = await apiClient.post<ApiSuccess<{ request: MaterialRequest }>>(`${API_ENDPOINTS.materialRequests}/${id}/reject`, { reason });
  return resp.data.data.request;
}

/** Actual stock issue — the only call that moves inventory. */
export async function issueMaterialRequest(id: string, items: Array<{ itemId: string; quantity: number }>): Promise<MaterialRequest> {
  const resp = await apiClient.post<ApiSuccess<{ request: MaterialRequest }>>(`${API_ENDPOINTS.materialRequests}/${id}/issue`, { items });
  return resp.data.data.request;
}

export async function cancelMaterialRequest(id: string): Promise<MaterialRequest> {
  const resp = await apiClient.post<ApiSuccess<{ request: MaterialRequest }>>(`${API_ENDPOINTS.materialRequests}/${id}/cancel`);
  return resp.data.data.request;
}

/**
 * ADDITIONAL material request (Phase 7 extension, §35–§37).
 * Creates a NEW request row (requestType = ADDITIONAL) linked to the parent
 * INITIAL request — the original request is never mutated. Only an executor
 * may raise one; the server enforces role, scope, reason and dish-material
 * restrictions.
 */
export async function createAdditionalMaterialRequest(payload: {
  eventId: string;
  reason: string;
  note?: string | null;
  notes?: string | null;
  parentRequestId?: string | null;
  items: Array<{ eventMaterialId: string; requestedQuantity: number; remarks?: string | null }>;
}): Promise<MaterialRequest> {
  const { eventId, ...body } = payload;
  const resp = await apiClient.post<ApiSuccess<{ request: MaterialRequest }>>(
    eventMaterialRequestsPath(eventId),
    body,
  );
  return resp.data.data.request;
}
