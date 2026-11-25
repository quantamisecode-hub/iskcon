import { z } from 'zod';
import { EVENT_EXPENSE_CATEGORIES } from '../constants/app.js';

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  });

/**
 * ADMIN-only non-inventory event expenses. Strict: the client supplies the
 * amount only; no computed financial field is accepted from the browser.
 */
export const createEventExpenseSchema = z
  .object({
    eventId: z.string().uuid(),
    category: z.enum(EVENT_EXPENSE_CATEGORIES),
    description: z.string().trim().min(1).max(255),
    amount: z.number().positive().max(999_999_999.99),
    expenseDate: calendarDate,
    reference: z.string().trim().max(100).optional().nullable(),
    notes: z.string().trim().max(500).optional().nullable(),
  })
  .strict();

export const updateEventExpenseSchema = createEventExpenseSchema
  .omit({ eventId: true })
  .partial()
  .strict();

export const eventExpenseIdParamsSchema = z.object({ id: z.string().uuid() }).strict();
export const eventExpenseEventParamsSchema = z.object({ eventId: z.string().uuid() }).strict();

export type CreateEventExpenseInput = z.infer<typeof createEventExpenseSchema>;
export type UpdateEventExpenseInput = z.infer<typeof updateEventExpenseSchema>;
