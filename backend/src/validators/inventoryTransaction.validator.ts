import { z } from 'zod';

export const inventoryTransactionSchema = z
  .object({
    foodItemId: z.string().trim().uuid(),
    transactionType: z.enum(['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'RETURN']),
    quantity: z.number().int().min(1),
    balanceBefore: z.number().int().min(0),
    balanceAfter: z.number().int().min(0),
    referenceType: z.string().trim().optional(),
    referenceId: z.string().trim().optional(),
    performedBy: z.string().trim().uuid().optional(),
    remarks: z.string().trim().optional(),
  })
  .strict();

export type CreateInventoryTransactionInput = z.infer<typeof inventoryTransactionSchema>;