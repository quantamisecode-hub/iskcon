import { API_ENDPOINTS } from '../../../constants/apiEndpoints';
import { apiClient } from '../../../services/api/apiClient';
import type { ApiSuccess } from '../../../types/api';

/**
 * Users + Assignments API layer (ADMIN-only on the backend).
 * Historical ownership is never rewritten - assignments keep full history.
 */

export interface ManagedUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'ADMIN' | 'EXECUTOR';
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string | null;
}

export interface UsersPage {
  users: ManagedUser[];
  total: number;
  page: number;
  pageSize: number;
}

export async function fetchUsers(filters: { search?: string; role?: string; isActive?: string; page?: number; pageSize?: number } = {}): Promise<UsersPage> {
  const params: Record<string, string | number | boolean> = {};
  if (filters.search) params['search'] = filters.search;
  if (filters.role) params['role'] = filters.role;
  if (filters.isActive) params['isActive'] = filters.isActive;
  if (filters.page) params['page'] = filters.page;
  if (filters.pageSize) params['pageSize'] = filters.pageSize;
  const response = await apiClient.get<ApiSuccess<UsersPage>>(API_ENDPOINTS.users, { params });
  return response.data.data;
}

export async function fetchUser(id: string): Promise<ManagedUser> {
  const response = await apiClient.get<ApiSuccess<{ user: ManagedUser }>>(`${API_ENDPOINTS.users}/${id}`);
  return response.data.data.user;
}

export interface CreateUserPayload {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: 'ADMIN' | 'EXECUTOR';
}

export async function createUser(payload: CreateUserPayload): Promise<ManagedUser> {
  const response = await apiClient.post<ApiSuccess<{ user: ManagedUser }>>(API_ENDPOINTS.users, payload);
  return response.data.data.user;
}

export async function updateUser(id: string, payload: { firstName?: string; lastName?: string; email?: string; role?: 'ADMIN' | 'EXECUTOR' }): Promise<ManagedUser> {
  const response = await apiClient.patch<ApiSuccess<{ user: ManagedUser }>>(`${API_ENDPOINTS.users}/${id}`, payload);
  return response.data.data.user;
}

export async function setUserStatus(id: string, status: 'ACTIVE' | 'INACTIVE'): Promise<ManagedUser> {
  const response = await apiClient.patch<ApiSuccess<{ user: ManagedUser }>>(`${API_ENDPOINTS.users}/${id}/status`, { status });
  return response.data.data.user;
}

/**
 * ADMIN override — reset a user's password without the old one.
 * The target's sessions are all revoked server-side.
 */
export async function resetUserPassword(id: string, newPassword: string): Promise<void> {
  await apiClient.post(`${API_ENDPOINTS.users}/${id}/reset-password`, { newPassword });
}

/**
 * Hard-delete a user (audit-safe, FK-safe). Refused when the user owns events,
 * is the last active ADMIN, or is the acting admin (self-delete).
 */
export async function deleteUser(id: string): Promise<void> {
  await apiClient.delete(`${API_ENDPOINTS.users}/${id}`);
}

// ---------------- Assignments ----------------

export interface AssignmentRow {
  id: string;
  assignedAt: string;
  unassignedAt: string | null;
  isActive: boolean;
  admin: ManagedUser;
  executor: ManagedUser;
}

export interface AssignmentsPage {
  assignments: AssignmentRow[];
  total: number;
  page: number;
  pageSize: number;
}

export async function fetchAssignments(filters: { activeOnly?: boolean; page?: number; pageSize?: number } = {}): Promise<AssignmentsPage> {
  const params: Record<string, string | number | boolean> = { activeOnly: filters.activeOnly === false ? 'false' : 'true' };
  if (filters.page) params['page'] = filters.page;
  if (filters.pageSize) params['pageSize'] = filters.pageSize;
  const response = await apiClient.get<ApiSuccess<AssignmentsPage>>(API_ENDPOINTS.assignments, { params });
  return response.data.data;
}

export async function assignExecutor(executorId: string, adminId?: string): Promise<void> {
  await apiClient.post(API_ENDPOINTS.assignments, { executorId, ...(adminId ? { adminId } : {}) });
}

export async function unassignExecutor(assignmentId: string): Promise<void> {
  await apiClient.delete(`${API_ENDPOINTS.assignments}/${assignmentId}`);
}
