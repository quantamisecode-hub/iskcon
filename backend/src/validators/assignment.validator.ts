import { z } from 'zod';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const createAssignmentSchema = z
  .object({
    executorId: z.string().regex(UUID_PATTERN),
    /** Optional explicit ADMIN to assign to. Defaults to the authenticated admin. */
    adminId: z.string().regex(UUID_PATTERN).optional(),
  })
  .strict();

export const listAssignmentsQuerySchema = z
  .object({
    activeOnly: z.enum(['true', 'false']).optional().transform((v) => v !== 'false'),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
