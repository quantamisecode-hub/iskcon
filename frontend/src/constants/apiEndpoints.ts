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
  profile: '/auth/profile',
  avatar: '/auth/avatar',
  changePassword: '/auth/change-password',
  users: '/users',
  assignments: '/assignments',
  events: '/events',
  dishes: '/dishes',
  calendarEvents: '/calendar/events',
  foodItems: '/food-items',
  vendors: '/vendors',
  units: '/units',
  dashboardSummary: '/dashboard/summary',
  materialRequests: '/material-requests',
  materialReturns: '/returns',
  notifications: '/notifications',
  ledger: '/ledger',
  stockLots: '/stock-lots',
  fifoPreview: '/fifo/preview',
  inventoryValuation: '/inventory/valuation',
  eventExpenses: '/event-expenses',
  financial: '/financial',
} as const;

export function eventExpensesPath(id?: string): string {
  return id ? `${API_ENDPOINTS.eventExpenses}/${id}` : API_ENDPOINTS.eventExpenses;
}

export function financialEventPath(eventId: string): string {
  return `${API_ENDPOINTS.financial}/events/${eventId}`;
}

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

/** Undo the last lifecycle move: POST /events/:id/undo */
export function eventUndoPath(id: string): string {
  return `${API_ENDPOINTS.events}/${id}/undo`;
}

/** Ready for Dispatch: POST /events/:id/dispatch */
export function eventDispatchPath(id: string): string {
  return `${API_ENDPOINTS.events}/${id}/dispatch`;
}

/** Verifier dropdown options: GET /events/:id/dispatch/verifiers */
export function eventDispatchVerifiersPath(id: string): string {
  return `${API_ENDPOINTS.events}/${id}/dispatch/verifiers`;
}

/** FIFO lot ledger: GET /stock-lots (list) or /stock-lots/:id (detail + allocations). */
export function stockLotPath(id?: string): string {
  return id ? `${API_ENDPOINTS.stockLots}/${id}` : API_ENDPOINTS.stockLots;
}

/** ADMIN-only FIFO allocation preview: GET /fifo/preview?foodItemId=&quantity= */
export function fifoPreviewPath(): string {
  return API_ENDPOINTS.fifoPreview;
}

/** ADMIN-only stock valuation: GET /inventory/valuation */
export function inventoryValuationPath(): string {
  return API_ENDPOINTS.inventoryValuation;
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

/** Vendor detail / mutation path: /vendors/:id */
export function vendorPath(id?: string): string {
  return id ? `${API_ENDPOINTS.vendors}/${id}` : API_ENDPOINTS.vendors;
}

/** Vendor audit history: /vendors/audit (all) or /vendors/:id/audit (one vendor). */
export function vendorAuditPath(id?: string): string {
  return id ? `${API_ENDPOINTS.vendors}/${id}/audit` : `${API_ENDPOINTS.vendors}/audit`;
}

/** Admin-only activation: POST /vendors/:id/activate */
export function vendorActivatePath(id: string): string {
  return `${API_ENDPOINTS.vendors}/${id}/activate`;
}

/** Admin-only deactivation: POST /vendors/:id/deactivate */
export function vendorDeactivatePath(id: string): string {
  return `${API_ENDPOINTS.vendors}/${id}/deactivate`;
}
