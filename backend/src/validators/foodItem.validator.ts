import { z } from 'zod';

export const foodItemSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().optional(),
    categoryId: z.string().trim().uuid(),
    unitId: z.string().trim().uuid(),
    minimumStock: z.number().int().min(0),
    reorderLevel: z.number().int().min(0),
    isActive: z.boolean().default(true),
  })
  .strict();

export type CreateFoodItemInput = z.infer<typeof foodItemSchema>;
export type UpdateFoodItemInput = z.infer<typeof foodItemSchema>;