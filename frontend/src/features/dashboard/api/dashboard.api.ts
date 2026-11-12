import { API_ENDPOINTS } from '../../../constants/apiEndpoints';
import { apiClient } from '../../../services/api/apiClient';
import type { ApiSuccess } from '../../../types/api';
import type { EventStatus } from '../../events/types';

/**
 * Dashboard summary API (read-only, deterministic, scoped by role).
 * pendingRequests is real data from material-requests once Phase 6 is live.
 */

export interface DashboardEvent {
  id: string;
  eventCode: string;
  name: string;
  eventDate: string;
  startTime: string;
  endTime: string | null;
  numberOfPeople: number;
  location: string | null;
  status: EventStatus;
  dishCount: number;
}

export interface PendingRequestItem {
  id: string;
  requestCode: string;
  eventId: string;
  eventName: string;
  eventDate: string;
  itemCount: number;
  status: string;
  requestedBy?: string;
  createdAt: string;
}

export interface PendingRequestsSummary {
  pendingCount: number;
  draftCount?: number;
  items: PendingRequestItem[];
}

export interface LowStockItem {
  id: string;
  name: string;
  quantity: number;
  minimumStock: number;
  reorderLevel: number;
  unit: string;
}

export interface FrequentItem {
  foodItemId: string;
  name: string;
  transactionCount: number;
}

export interface RecentActivityItem {
  id: string;
  item: string;
  transactionType: string;
  quantity: number;
  createdAt: string;
  performedBy: string;
}

export interface DemandTrendItem {
  foodItemId: string;
  name: string;
  recentCount: number;
  previousCount: number;
  deltaPct: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface DashboardKpis {
  totalFoodItems: number;
  totalCurrentStock: number;
  /** Items with quantity > 0 (coverage numerator). */
  itemsInStock?: number;
  /** All tracked inventory rows (coverage denominator). */
  totalItems?: number;
  lowStockCount: number;
  criticalCount: number;
  outOfStockCount: number;
  healthyCount: number;
  todaysEventCount: number;
  stockInToday: number;
  stockOutToday: number;
  pendingRequestCount?: number;
  draftRequestCount?: number;
  reorderRequiredCount?: number;
}

/** Per-unit totals — mixed units (kg/L/pcs) are never summed together. */
export interface StockByUnit {
  unit: string;
  quantity: number;
}

export interface AdminDashboardSummary {
  role: 'ADMIN';
  generatedAt: string;
  timezone: string;
  today: string;
  kpis: DashboardKpis;
  todaysEvents: DashboardEvent[];
  upcomingEvents: DashboardEvent[];
  lowStockItems: LowStockItem[];
  reorderRequired?: LowStockItem[];
  stockByUnit?: StockByUnit[];
  inventoryHealth: { healthy: number; low: number; critical: number; outOfStock: number };
  stockMovement7d: { date: string; stockIn: number; stockOut: number }[];
  frequentlyUsedItems: FrequentItem[];
  recentActivity: RecentActivityItem[];
  alerts: { id: string; severity: 'danger' | 'warning' | 'info'; title: string; detail: string }[];
  demandTrend?: DemandTrendItem[];
  hasData?: boolean;
  notEnoughDataFor?: string[];
  pendingRequests: PendingRequestsSummary;
}

export interface ExecutorDashboardSummary {
  role: 'EXECUTOR';
  generatedAt: string;
  timezone: string;
  today: string;
  todaysEvents: DashboardEvent[];
  upcomingEvents: DashboardEvent[];
  pendingRequests: PendingRequestsSummary;
  kpis?: { pendingRequestCount?: number };
}

export type DashboardSummary = AdminDashboardSummary | ExecutorDashboardSummary;

/** GET /api/v1/dashboard/summary */
export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const response = await apiClient.get<ApiSuccess<DashboardSummary>>(API_ENDPOINTS.dashboardSummary);
  return response.data.data;
}
