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
  baseURL: appConfig.apiBaseUrl,
  timeout: appConfig.apiTimeoutMs,
  withCredentials: true,
});

/**
 * Converts ANY Axios error into a safe, typed ApiRequestError.
 * Users never see raw network or server internals.
 */
export function toApiRequestError(error: unknown): ApiRequestError {
  if (error instanceof ApiRequestError) return error;

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const payload: ApiFailure | undefined = error.response?.data as ApiFailure | undefined;
    const requestUrl = error.config?.url ?? '';

    // 401 + a session-bearing request -> broadcast so the UI can react.
    // Skipped for /auth/me (a plain "who am I" probe must not flash the UI).
    if (status === 401 && !requestUrl.includes(API_ENDPOINTS.me)) {
      window.dispatchEvent(
        new CustomEvent<AuthEventDetail>(SESSION_EXPIRED_EVENT, {
          detail: { reason: 'unauthorized' },
        }),
      );
    }

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
    return 'Cannot reach the server. Check your connection.';
  }
  if (status === 429) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  return 'Something went wrong. Please try again.';
}
