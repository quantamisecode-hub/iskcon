import {
  API_ENDPOINTS,
  eventReturnablePath,
  eventReturnsPath,
  returnActionPath,
  returnsPath,
} from '../../../constants/apiEndpoints';
import { apiClient } from '../../../services/api/apiClient';
import type { ApiSuccess } from '../../../types/api';

/**
 * MATERIAL RETURN API (Phase 7 extension).
 *
 * A MaterialReturn is the FOURTH distinct concept — never merged with a dish
 * material definition, a material request or an inventory issue:
 * "what quantity physically came back".
 *
 * Golden rules mirrored here:
 *  - Only an EXECUTOR creates a return (POST /events/:eventId/returns).
 *  - Only an ADMIN accepts/rejects (POST /returns/:id/accept|reject).
 *  - Submitting never moves stock; only an ACCEPTED return restocks inventory.
 */

export type MaterialReturnStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'PENDING_ADMIN_REVIEW'
  | 'ACCEPTED'
  | 'PARTIALLY_ACCEPTED'
  | 'REJECTED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface MaterialReturnItem {
  id: string;
  foodItemId: string;
  foodItemName: string;
  unitId: string;
  unitSymbol: string;
  unitName: string;
  issuedQuantity: number;
  previouslyReturnedQuantity: number;
  requestedReturnQuantity: number;
  acceptedReturnQuantity: number;
  rejectedReturnQuantity: number;
  /** Snapshot at submit: issued − acceptedReturned back then. */
  returnableAtSubmit: number;
  reason?: string | null;
}

export interface MaterialReturnTimelineEntry {
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

export interface MaterialReturn {
  id: string;
  returnCode: string;
  eventId: string;
  event: {
    id: string;
    name: string;
    eventCode: string;
    eventDate: string;
    status: string;
    adminId: string;
    cancellationReason?: string | null;
  };
  requesterId: string;
  requester: { id: string; firstName: string; lastName: string; email?: string };
  adminId: string;
  admin: { id: string; firstName: string; lastName: string; email?: string };
  status: MaterialReturnStatus;
  reason?: string | null;
  reasonNote?: string | null;
  notes?: string | null;
  requestedAt: string;
  reviewedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  items: MaterialReturnItem[];
  timeline?: MaterialReturnTimelineEntry[];
}

export interface ReturnsPageResult {
  returns: MaterialReturn[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ReturnsFilters {
  /** Single status or comma-separated list (tab filters). */
  status?: string;
  /** true → only completed (completedAt set) returns. */
  completed?: boolean;
  eventId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface ReturnableLine {
  foodItemId: string;
  foodItemName: string;
  unitSymbol: string;
  unitName: string;
  availableStock: number;
  /** issued − acceptedReturned > 0 (§5/§41 eligibility). */
  returnableQuantity: number;
}

function params(filters: ReturnsFilters): Record<string, string | number | boolean> {
  const p: Record<string, string | number | boolean> = {};
  if (filters.status) p['status'] = filters.status;
  if (filters.completed !== undefined) p['completed'] = String(filters.completed);
  if (filters.eventId) p['eventId'] = filters.eventId;
  if (filters.search) p['search'] = filters.search;
  if (filters.page) p['page'] = filters.page;
  if (filters.pageSize) p['pageSize'] = filters.pageSize;
  if (filters.sort) p['sort'] = filters.sort;
  if (filters.order) p['order'] = filters.order;
  return p;
}

/** GET /returns — scoped server-side (admin: own events; executor: own + assigned). */
export async function fetchMaterialReturns(filters: ReturnsFilters = {}): Promise<ReturnsPageResult> {
  const resp = await apiClient.get<ApiSuccess<ReturnsPageResult>>(API_ENDPOINTS.materialReturns, { params: params(filters) });
  return resp.data.data;
}

/** GET /returns/:id */
export async function fetchMaterialReturn(id: string): Promise<MaterialReturn> {
  const resp = await apiClient.get<ApiSuccess<{ return: MaterialReturn }>>(returnsPath(id));
  return resp.data.data.return;
}

/** POST /events/:eventId/returns — EXECUTOR only; never moves stock. */
export async function createMaterialReturn(
  eventId: string,
  payload: {
    reason?: string | null;
    reasonNote?: string | null;
    notes?: string | null;
    items: Array<{ foodItemId: string; quantity: number; reason?: string | null }>;
  },
): Promise<MaterialReturn> {
  const resp = await apiClient.post<ApiSuccess<{ return: MaterialReturn }>>(eventReturnsPath(eventId), payload);
  return resp.data.data.return;
}

/** POST /returns/:id/accept — ADMIN only; THE call that restocks inventory. */
export async function acceptMaterialReturn(
  id: string,
  items?: Array<{ itemId: string; acceptedQuantity: number }>,
): Promise<MaterialReturn> {
  const resp = await apiClient.post<ApiSuccess<{ return: MaterialReturn }>>(
    returnActionPath(id, 'accept'),
    items ? { items } : {},
  );
  return resp.data.data.return;
}

/** POST /returns/:id/reject — ADMIN only; no stock movement. */
export async function rejectMaterialReturn(id: string, reason: string): Promise<MaterialReturn> {
  const resp = await apiClient.post<ApiSuccess<{ return: MaterialReturn }>>(returnActionPath(id, 'reject'), { reason });
  return resp.data.data.return;
}

/** GET /events/:eventId/returns/returnable — live eligible lines for the modal. */
export async function fetchReturnableLines(eventId: string): Promise<{ eventId: string; lines: ReturnableLine[] }> {
  const resp = await apiClient.get<ApiSuccess<{ eventId: string; lines: ReturnableLine[] }>>(eventReturnablePath(eventId));
  return resp.data.data;
}
