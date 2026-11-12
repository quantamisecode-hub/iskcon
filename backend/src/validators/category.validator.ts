import { z } from 'zod';

export const categorySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().optional(),
    isActive: z.boolean().default(true),
  })
  .strict();

export type CreateCategoryInput = z.infer<typeof categorySchema>;
export type UpdateCategoryInput = z.infer<typeof categorySchema>;