import { z } from 'zod';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const createAssignmentSchema = z
  .object({
    executorId: z.string().regex(UUID_PATTERN),
  })
  .strict();

export const listAssignmentsQuerySchema = z
  .object({
    activeOnly: z.enum(['true', 'false']).optional().transform((v) => v !== 'false'),
  })
  .strict();

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
