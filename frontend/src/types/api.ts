/**
 * Standard API response shapes.
 * Every backend response follows the same envelope:
 *   success -> { success: true,  data, message }
 *   failure -> { success: false, message, code, requestId }
 */

export interface ApiSuccess<TData> {
  success: true;
  data: TData;
  message?: string;
}

export interface ApiFailure {
  success: false;
  message: string;
  code?: string;
  requestId?: string;
}

export type ApiResponse<TData> = ApiSuccess<TData> | ApiFailure;
