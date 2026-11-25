import { z } from 'zod';
import { EVENT_STATUSES } from './event.validator.js';
import { EVENT_TYPES, LEGACY_EVENT_TYPES } from '../constants/app.js';

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  });

/** Ledger filters. All financial values are derived server-side. */
export const financialSummaryQuerySchema = z
  .object({
    dateFrom: calendarDate.optional(),
    dateTo: calendarDate.optional(),
    eventId: z.string().uuid().optional(),
    location: z.string().trim().max(200).optional(),
    eventType: z.enum([...EVENT_TYPES, ...LEGACY_EVENT_TYPES]).optional(),
    stockType: z.enum(['ALL', 'CHARITY', 'EXPENSE', 'UNCLASSIFIED']).default('ALL'),
    result: z.enum(['ALL', 'SURPLUS', 'DEFICIT', 'BREAK_EVEN']).default('ALL'),
    status: z.enum(EVENT_STATUSES).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()
  .refine((query) => !query.dateFrom || !query.dateTo || query.dateFrom <= query.dateTo, {
    message: 'dateTo must not be earlier than dateFrom',
  });

export const financialEventParamsSchema = z.object({ eventId: z.string().uuid() }).strict();
export type FinancialSummaryQuery = z.infer<typeof financialSummaryQuerySchema>;
