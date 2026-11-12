import { z } from 'zod';

/** Query schema for the global inventory ledger. */
export const listLedgerQuerySchema = z
  .object({
    itemId: z.string().uuid().optional(),
    type: z.enum(['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'RETURN']).optional(),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    userId: z.string().uuid().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()
  .refine((data) => !data.dateFrom || !data.dateTo || data.dateTo >= data.dateFrom, {
    message: 'dateTo must be on or after dateFrom',
    path: ['dateTo'],
  });

export type ListLedgerQuery = z.infer<typeof listLedgerQuerySchema>;
