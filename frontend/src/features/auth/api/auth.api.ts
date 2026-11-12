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
  avatarUrl?: string | null;
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

/** PATCH /api/v1/auth/profile — update name/email (email change requires currentPassword). */
export async function updateProfileRequest(input: {
  firstName?: string;
  lastName?: string;
  email?: string;
  currentPassword?: string;
}): Promise<AuthUserProfile> {
  const response = await apiClient.patch<ApiSuccess<{ user: AuthUserProfile }>>(
    '/auth/profile',
    input,
  );
  return response.data.data.user;
}

/** POST /api/v1/auth/change-password — verifies current password; other sessions are signed out. */
export async function changePasswordRequest(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  await apiClient.post('/auth/change-password', input);
}

/** POST /api/v1/auth/avatar — set (data URL) or remove (null) the avatar. */
export async function updateAvatarRequest(avatarUrl: string | null): Promise<AuthUserProfile> {
  const response = await apiClient.post<ApiSuccess<{ user: AuthUserProfile }>>(
    '/auth/avatar',
    { avatarUrl },
  );
  return response.data.data.user;
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
