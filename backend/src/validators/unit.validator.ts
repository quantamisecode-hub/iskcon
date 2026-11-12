import { z } from 'zod';

export const unitSchema = z
  .object({
    name: z.string().trim().min(1).max(50),
    symbol: z.string().trim().min(1).max(10),
    unitType: z.enum(['WEIGHT', 'VOLUME', 'COUNT', 'OTHER']),
    isActive: z.boolean().default(true),
  })
  .strict();

export type CreateUnitInput = z.infer<typeof unitSchema>;
export type UpdateUnitInput = z.infer<typeof unitSchema>;