/**
 * Standard API response shapes.
 *   success -> { success: true,  data, message }
 *   failure -> { success: false, error: { code, message }, requestId }
 */
export interface ApiSuccess<TData> {
  success: true;
  data: TData;
  message?: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
}

export interface ApiFailure {
  success: false;
  error: ApiErrorBody;
  requestId?: string;
}

export type ApiResponse<TData> = ApiSuccess<TData> | ApiFailure;
