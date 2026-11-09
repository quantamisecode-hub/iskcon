/**
 * Standard success response helper.
 * Every endpoint must send responses through this envelope.
 */
import type { Response } from 'express';

export interface ApiSuccessPayload<TData> {
  success: true;
  data: TData;
  message?: string;
}

export function sendSuccess<TData>(
  res: Response,
  data: TData,
  message = 'Operation successful',
  statusCode = 200,
): void {
  res.status(statusCode).json({ success: true, data, message });
}
