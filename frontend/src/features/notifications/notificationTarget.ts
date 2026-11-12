import type { NotificationItem } from '../../features/notifications/api/notifications.api';

/**
 * Where a notification should land the user, and what action they can take there.
 * Every actionable notification deep-links to the page where the recipient acts —
 * never a dead end.
 */
export function notificationTarget(item: Pick<NotificationItem, 'type' | 'referenceType' | 'referenceId'>): string | null {
  const refId = item.referenceId ?? null;
  const refType = item.referenceType ?? item.type;
  if (refType === 'MATERIAL_REQUEST' && refId) return `/requests/${refId}`;
  if (refType === 'MATERIAL_RETURN' && refId) return `/returns/${refId}`;
  if (refType === 'EVENT' && refId) return `/events/${refId}`;
  if (refType === 'FOOD_ITEM' && refId) return `/inventory/food-items/${refId}`;
  if (refType === 'FOOD_ITEM') return '/inventory';
  // Fallback by type
  if (item.type === 'MATERIAL_REQUEST_SUBMITTED' && refId) return `/requests/${refId}`;
  if (item.type === 'MATERIAL_REQUEST_APPROVED' && refId) return `/requests/${refId}`;
  if (item.type === 'MATERIAL_REQUEST_REJECTED' && refId) return `/requests/${refId}`;
  if (item.type === 'MATERIAL_REQUEST_CANCELLED' && refId) return `/requests/${refId}`;
  if (item.type === 'MATERIAL_REQUEST_ISSUED' && refId) return `/requests/${refId}`;
  if (item.type === 'MATERIAL_REQUEST_PARTIALLY_ISSUED' && refId) return `/requests/${refId}`;
  if (item.type === 'EVENT_CANCELLED' && refId) return `/events/${refId}`;
  if (item.type.startsWith('RETURN_') && refId) return `/returns/${refId}`;
  if (item.type.startsWith('REQUEST_ADDITIONAL_') && refId) return `/requests/${refId}`;
  if ((item.type === 'OUT_OF_STOCK' || item.type === 'LOW_STOCK' || item.type === 'REORDER_REQUIRED') && refId) return `/inventory/food-items/${refId}`;
  return null;
}

export function notificationActionLabel(item: Pick<NotificationItem, 'type' | 'referenceType'>): string | null {
  if (item.type === 'MATERIAL_REQUEST_SUBMITTED' || item.referenceType === 'MATERIAL_REQUEST') return 'Review & act →';
  if (item.type === 'MATERIAL_REQUEST_APPROVED') return 'View approved request →';
  if (item.type === 'MATERIAL_REQUEST_REJECTED') return 'View & fix plan →';
  if (item.type === 'MATERIAL_REQUEST_CANCELLED') return 'View request →';
  if (item.type === 'MATERIAL_REQUEST_ISSUED') return 'View issued request →';
  if (item.type === 'MATERIAL_REQUEST_PARTIALLY_ISSUED' || item.type === 'REQUEST_ADDITIONAL_PARTIALLY_ISSUED') return 'View remaining quantity →';
  if (item.type.startsWith('RETURN_')) return item.type === 'RETURN_REQUESTED' ? 'Review return →' : 'View return →';
  if (item.type === 'EVENT_CANCELLED') return 'Open event →';
  if (item.type.startsWith('REQUEST_ADDITIONAL_')) return 'View request →';
  if (item.type === 'OUT_OF_STOCK' || item.type === 'LOW_STOCK' || item.type === 'REORDER_REQUIRED' || item.referenceType === 'FOOD_ITEM') return 'Stock In →';
  if (item.referenceType === 'EVENT') return 'Open event →';
  return null;
}
