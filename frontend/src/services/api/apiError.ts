/**
 * Typed error raised for every API call failure.
 * The message shown to users is always safe; technical details
 * are kept separately for developers (debugging only).
 */
export class ApiRequestError extends Error {
  readonly status: number | undefined;
  readonly code: string;
  readonly requestId?: string;
  /** Developer-facing detail (never rendered directly in the UI). */
  readonly detail: string;

  constructor(input: { status?: number; code?: string; message: string; requestId?: string; detail?: string }) {
    super(input.message);
    this.name = 'ApiRequestError';
    this.status = input.status;
    this.code = input.code ?? 'UNKNOWN_ERROR';
    this.requestId = input.requestId;
    this.detail = input.detail ?? input.message;
  }
}
