import axios, { type AxiosInstance } from 'axios';
import { appConfig } from '../../config/env';
import { SESSION_EXPIRED_EVENT, type AuthEventDetail } from '../../constants/authEvents';
import type { ApiFailure } from '../../types/api';
import { ApiRequestError } from './apiError';

/**
 * THE single Axios client for the whole frontend.
 * Components never configure Axios themselves - they call the
 * endpoint functions built on top of this client.
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: appConfig.apiBaseUrl,
  timeout: appConfig.apiTimeoutMs,
  // Secure-cookie authentication (planned in Phase 2) needs this:
  // send/receive HTTP-only cookies on every API call.
  withCredentials: true,
});

/**
 * Converts ANY Axios error into a safe, typed ApiRequestError.
 * Guarantees users never see raw network or server internals.
 */
export function toApiRequestError(error: unknown): ApiRequestError {
  if (error instanceof ApiRequestError) return error;

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const payload: ApiFailure | undefined = error.response?.data as ApiFailure | undefined;

    // 401 = session expired / not logged in -> broadcast so the app can react.
    if (status === 401) {
      window.dispatchEvent(new CustomEvent<AuthEventDetail>(SESSION_EXPIRED_EVENT, {
        detail: { reason: 'unauthorized' },
      }));
    }

    return new ApiRequestError({
      status,
      code: payload?.code,
      message: payload?.message ?? fallbackMessage(status),
      requestId: payload?.requestId,
      detail: error.message,
    });
  }

  return new ApiRequestError({ message: 'Something went wrong', detail: String(error) });
}

function fallbackMessage(status?: number): string {
  if (status === undefined) return 'Cannot reach the server. Check your connection.';
  return 'Something went wrong. Please try again.';
}
