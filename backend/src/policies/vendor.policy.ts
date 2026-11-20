import { ROLES } from '../constants/roles.js';
import { ApiError } from '../middleware/error.middleware.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

/**
 * CENTRALIZED VENDOR MANAGEMENT POLICY.
 *
 * Vendor data is master data with supplier/payment information: only ADMIN may
 * access or manipulate it. The strict `role === ROLES.ADMIN` comparison means
 * any unknown/future role is denied by default (fail closed).
 */
export type VendorActor = { id: string; role: string };

export function canManageVendors(actor: VendorActor | null | undefined): boolean {
  return !!actor && actor.role === ROLES.ADMIN;
}

export function requireVendorAdmin(actor: VendorActor | null | undefined): void {
  if (!actor) {
    throw new ApiError({
      statusCode: 401,
      code: ERROR_CODES.UNAUTHORIZED,
      message: 'Authentication required.',
    });
  }
  if (actor.role !== ROLES.ADMIN) {
    throw new ApiError({
      statusCode: 403,
      code: ERROR_CODES.FORBIDDEN,
      message: 'You do not have permission to access Vendor Management.',
    });
  }
}
