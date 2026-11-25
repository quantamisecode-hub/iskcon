import { z } from 'zod';
import { STOCK_TYPES } from '../constants/app.js';

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  });

/**
 * STOCK INWARD. Strict by design: stockType is mandatory and the client may
 * never submit totalCost or any computed FIFO value. unitCost is the actual
 * valuation basis (cash purchase cost or in-kind value) of this lot only.
 */
export const stockInSchema = z
  .object({
    quantity: z.number().positive().max(999_999_999.999),
    stockType: z.enum(STOCK_TYPES),
    vendorId: z.string().uuid().optional().nullable(),
    purchaseDate: calendarDate.optional().nullable(),
    receivedDate: calendarDate.optional().nullable(),
    unitCost: z.number().nonnegative().max(999_999_999.99).optional().nullable(),
    referenceNumber: z.string().trim().max(100).optional().nullable(),
    donorName: z.string().trim().min(1).max(200).optional().nullable(),
    notes: z.string().trim().max(500).optional().nullable(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.stockType === 'CHARITY') {
      if (!input.donorName) {
        ctx.addIssue({ code: 'custom', path: ['donorName'], message: 'Donor name is required for charity stock.' });
      }
      if (input.vendorId) {
        ctx.addIssue({ code: 'custom', path: ['vendorId'], message: 'Charity stock must not be attributed to a vendor.' });
      }
      if (input.referenceNumber) {
        ctx.addIssue({ code: 'custom', path: ['referenceNumber'], message: 'Charity stock does not have an invoice number.' });
      }
    } else if (input.donorName) {
      ctx.addIssue({ code: 'custom', path: ['donorName'], message: 'Donor name is only valid for charity stock.' });
    }
  });

export type StockInInput = z.infer<typeof stockInSchema>;

export const inventorySchema = z
  .object({
    foodItemId: z.string().trim().uuid(),
    currentQuantity: z.number().int().min(0).default(0),
  })
  .strict();

export type UpdateInventoryInput = z.infer<typeof inventorySchema>;