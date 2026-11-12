import axios, { type AxiosInstance } from 'axios';
import { appConfig } from '../../config/env';
import { SESSION_EXPIRED_EVENT, type AuthEventDetail } from '../../constants/authEvents';
import { API_ENDPOINTS } from '../../constants/apiEndpoints';
import type { ApiFailure } from '../../types/api';
import { ApiRequestError } from './apiError';

/**
 * THE single Axios client for the whole frontend.
 * Components never configure Axios themselves - they call the
 * endpoint functions built on top of this client.
 *
 * Session handling: the browser holds an HttpOnly cookie; this client
 * only keeps `withCredentials` so the cookie is sent automatically.
 * NO tokens are stored in localStorage/sessionStorage.
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: appConfig.apiUrl,
  timeout: appConfig.apiTimeoutMs,
  withCredentials: true,
});

/**
 * A dead session (expired / revoked / user deactivated) -> broadcast once so
 * AuthContext drops the user and protected routes redirect to /login.
 * Only the auth middleware's UNAUTHORIZED code counts: wrong-password 401s
 * (INVALID_CREDENTIALS on login / change-password) must not sign the user out.
 * /auth/me is skipped — a plain "who am I" probe must not flash the UI.
 * The original Axios error is re-thrown untouched; pages read `err.response`.
 */
apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const payload = error.response.data as ApiFailure | undefined;
      const requestUrl = error.config?.url ?? '';
      if (payload?.error?.code === 'UNAUTHORIZED' && !requestUrl.includes(API_ENDPOINTS.me)) {
        window.dispatchEvent(
          new CustomEvent<AuthEventDetail>(SESSION_EXPIRED_EVENT, {
            detail: { reason: 'unauthorized' },
          }),
        );
      }
    }
    return Promise.reject(error);
  },
);

/**
 * Converts ANY Axios error into a safe, typed ApiRequestError.
 * Users never see raw network or server internals.
 */
export function toApiRequestError(error: unknown): ApiRequestError {
  if (error instanceof ApiRequestError) return error;

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const payload: ApiFailure | undefined = error.response?.data as ApiFailure | undefined;

    return new ApiRequestError({
      status,
      code: payload?.error.code,
      message: payload?.error.message ?? fallbackMessage(status),
      requestId: payload?.requestId,
      detail: error.message,
    });
  }

  return new ApiRequestError({ message: 'Something went wrong', detail: String(error) });
}

function fallbackMessage(status?: number): string {
  if (status === undefined) {
    return 'Cannot reach the app. Check your connection and try again.';
  }
  if (status === 429) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  return 'Something went wrong. Please try again.';
}
