import { z } from 'zod';

export const inventorySchema = z
  .object({
    foodItemId: z.string().trim().uuid(),
    currentQuantity: z.number().int().min(0).default(0),
  })
  .strict();

export type UpdateInventoryInput = z.infer<typeof inventorySchema>;