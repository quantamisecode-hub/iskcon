import { API_ENDPOINTS } from '../../../constants/apiEndpoints';
import { apiClient } from '../../../services/api/apiClient';
import type { ApiSuccess } from '../../../types/api';

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  referenceType?: string | null;
  referenceId?: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationsResult {
  notifications: NotificationItem[];
  total: number;
  unreadCount: number;
  page: number;
  pageSize: number;
}

export async function fetchNotifications(filters: { unreadOnly?: boolean; page?: number; pageSize?: number } = {}): Promise<NotificationsResult> {
  const params: Record<string, string | number | boolean> = {};
  if (filters.unreadOnly !== undefined) params['unreadOnly'] = filters.unreadOnly;
  if (filters.page) params['page'] = filters.page;
  if (filters.pageSize) params['pageSize'] = filters.pageSize;
  const resp = await apiClient.get<ApiSuccess<NotificationsResult>>(API_ENDPOINTS.notifications, { params });
  return resp.data.data;
}

export async function fetchUnreadCount(): Promise<number> {
  const resp = await apiClient.get<ApiSuccess<{ unreadCount: number }>>(`${API_ENDPOINTS.notifications}/unread-count`);
  return resp.data.data.unreadCount;
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiClient.patch(`${API_ENDPOINTS.notifications}/${id}/read`);
}

export async function markAllNotificationsRead(): Promise<number> {
  const resp = await apiClient.post<ApiSuccess<{ updated: number }>>(`${API_ENDPOINTS.notifications}/mark-all-read`);
  return resp.data.data.updated;
}

export async function sendTestNotification(): Promise<NotificationItem> {
  const resp = await apiClient.post<ApiSuccess<{ notification: NotificationItem }>>(`${API_ENDPOINTS.notifications}/test`);
  return resp.data.data.notification;
}
