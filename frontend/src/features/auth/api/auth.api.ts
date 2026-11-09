import { API_ENDPOINTS } from '../../../constants/apiEndpoints';
import { apiClient } from '../../../services/api/apiClient';
import type { ApiSuccess } from '../../../types/api';

/**
 * Authentication API layer (feature-local).
 * Session tokens NEVER touch this module: the browser holds an
 * HttpOnly cookie that Axios attaches automatically.
 */
export interface AuthUserProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'ADMIN' | 'EXECUTOR';
  isActive: boolean;
}

interface AuthResponse {
  user: AuthUserProfile;
}

/** POST /api/v1/auth/login */
export async function loginRequest(email: string, password: string): Promise<AuthUserProfile> {
  const response = await apiClient.post<ApiSuccess<AuthResponse>>(API_ENDPOINTS.login, {
    email,
    password,
  });
  return response.data.data.user;
}

/** POST /api/v1/auth/logout — revokes the backend session, clears the cookie. */
export async function logoutRequest(): Promise<void> {
  await apiClient.post(API_ENDPOINTS.logout);
}

/** GET /api/v1/auth/me — null when no valid session exists. */
export async function fetchCurrentUser(): Promise<AuthUserProfile | null> {
  try {
    const response = await apiClient.get<ApiSuccess<AuthResponse>>(API_ENDPOINTS.me);
    return response.data.data.user;
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status;
    if (status === 401) return null;
    throw error;
  }
}
