/**
 * Single source of truth for API endpoint paths.
 *
 * The `/api/v1` prefix lives in the central configuration
 * (VITE_API_URL, see `src/config/env.ts`), so paths here start
 * after the version prefix. The final request URL is:
 *   `${VITE_API_URL}${endpoint}`
 */
export const API_ENDPOINTS = {
  health: '/health',
  healthDatabase: '/health/db',
  login: '/auth/login',
  logout: '/auth/logout',
  me: '/auth/me',
  users: '/users',
  assignments: '/assignments',
  events: '/events',
  dishes: '/dishes',
  calendarEvents: '/calendar/events',
  foodItems: '/food-items',
  units: '/units',
  dashboardSummary: '/dashboard/summary',
  materialRequests: '/material-requests',
  materialReturns: '/returns',
  notifications: '/notifications',
  ledger: '/ledger',
} as const;

export function materialRequestsPath(id?: string): string {
  return id ? `${API_ENDPOINTS.materialRequests}/${id}` : API_ENDPOINTS.materialRequests;
}

export function materialRequestActionPath(id: string, action: 'submit' | 'approve' | 'reject' | 'cancel'): string {
  return `${API_ENDPOINTS.materialRequests}/${id}/${action}`;
}

// ---------------- Material returns (Phase 7 extension) ----------------

export function returnsPath(id?: string): string {
  return id ? `${API_ENDPOINTS.materialReturns}/${id}` : API_ENDPOINTS.materialReturns;
}

export function returnActionPath(id: string, action: 'accept' | 'reject'): string {
  return `${API_ENDPOINTS.materialReturns}/${id}/${action}`;
}

/** Executor creates a return for an event: POST /events/:eventId/returns */
export function eventReturnsPath(eventId: string): string {
  return `${API_ENDPOINTS.events}/${eventId}/returns`;
}

/** Live returnable lines for the "Return Materials" modal. */
export function eventReturnablePath(eventId: string): string {
  return `${API_ENDPOINTS.events}/${eventId}/returns/returnable`;
}

/** Additional material request: POST /events/:eventId/material-requests */
export function eventMaterialRequestsPath(eventId: string): string {
  return `${API_ENDPOINTS.events}/${eventId}/material-requests`;
}

/** Computed §39/§40 material summary (never stored). */
export function eventMaterialSummaryPath(eventId: string): string {
  return `${API_ENDPOINTS.events}/${eventId}/material-summary`;
}

/** Cancellation with a mandatory reason: POST /events/:id/cancel */
export function eventCancelPath(id: string): string {
  return `${API_ENDPOINTS.events}/${id}/cancel`;
}

export function notificationsPath(id?: string): string {
  return id ? `${API_ENDPOINTS.notifications}/${id}` : API_ENDPOINTS.notifications;
}

export function notificationReadPath(id: string): string {
  return `${API_ENDPOINTS.notifications}/${id}/read`;
}

export function eventPath(id: string): string {
  return `${API_ENDPOINTS.events}/${id}`;
}

export function eventStatusPath(id: string): string {
  return `${API_ENDPOINTS.events}/${id}/status`;
}

export function eventDishesPath(eventId: string): string {
  return `${API_ENDPOINTS.events}/${eventId}/dishes`;
}

export function eventDishPath(eventId: string, eventDishId: string): string {
  return `${API_ENDPOINTS.events}/${eventId}/dishes/${eventDishId}`;
}

export function eventDishMaterialsPath(eventDishId: string): string {
  return `/event-dishes/${eventDishId}/materials`;
}

export function eventDishMaterialPath(eventDishId: string, materialId: string): string {
  return `/event-dishes/${eventDishId}/materials/${materialId}`;
}

export function dishMaterialsPath(dishId: string): string {
  return `${API_ENDPOINTS.dishes}/${dishId}/materials`;
}

export function dishMaterialPath(dishId: string, materialId: string): string {
  return `${API_ENDPOINTS.dishes}/${dishId}/materials/${materialId}`;
}

export function dishPath(id: string): string {
  return `${API_ENDPOINTS.dishes}/${id}`;
}

export function dishStatusPath(id: string): string {
  return `${API_ENDPOINTS.dishes}/${id}/status`;
}
