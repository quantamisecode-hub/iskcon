import { toApiRequestError } from '../../../services/api/apiClient';
import type { LoginError } from '../hooks/useLoginSubmit';

/** Maps any thrown value to a login-form-safe message (never leaks internals). */
export function formToAuthError(caught: unknown): LoginError {
  const apiError = toApiRequestError(caught);
  return { message: apiError.message };
}
