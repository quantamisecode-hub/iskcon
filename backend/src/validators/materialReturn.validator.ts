import { z } from 'zod';

/**
 * MATERIAL RETURN VALIDATORS (Phase 7 extension).
 * `.strict()` everywhere: unexpected fields are rejected (no mass assignment).
 */

export const materialReturnStatusSchema = z.enum([
  'DRAFT',
  'SUBMITTED',
  'PENDING_ADMIN_REVIEW',
  'ACCEPTED',
  'PARTIALLY_ACCEPTED',
  'REJECTED',
  'COMPLETED',
  'CANCELLED',
] as const);

export const listMaterialReturnsQuerySchema = z
  .object({
    /**
     * Single status or comma-separated list (tab filters like
     * "ACCEPTED,PARTIALLY_ACCEPTED"). Every value must be a valid status.
     */
    status: z
      .string()
      .trim()
      .max(100)
      .optional()
      .refine(
        (value) =>
          value === undefined ||
          value
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean)
            .every((part) => materialReturnStatusSchema.safeParse(part).success),
        { message: 'Invalid status filter.' },
      ),
    /** "true" → only returns with completedAt set (Completed tab). */
    completed: z.enum(['true', 'false']).optional(),
    eventId: z.string().uuid().optional(),
    search: z.string().trim().max(200).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    sort: z.enum(['createdAt', 'requestedAt', 'status']).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();

export const returnIdParamsSchema = z.object({ id: z.string().uuid() }).strict();

export const eventReturnParamsSchema = z.object({ eventId: z.string().uuid() }).strict();

export const createMaterialReturnSchema = z
  .object({
    /** Picklist-style reason (EVENT_CANCELLED, EXTRA_MATERIAL, OTHER, ...). */
    reason: z.string().trim().max(50).optional().nullable(),
    /** Mandatory server-side when reason = OTHER. */
    reasonNote: z.string().trim().max(500).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
    items: z
      .array(
        z
          .object({
            foodItemId: z.string().uuid(),
            quantity: z.number().positive().max(999999999.999),
            reason: z.string().trim().max(100).optional().nullable(),
          })
          .strict(),
      )
      .min(1, 'Select at least one material to return.')
      .max(200),
  })
  .strict();

export const acceptMaterialReturnSchema = z
  .object({
    /** Optional per-item accepted quantities (partial accept). Omitted = accept all in full. */
    items: z
      .array(
        z
          .object({
            itemId: z.string().uuid(),
            acceptedQuantity: z.number().min(0).max(999999999.999),
          })
          .strict(),
      )
      .min(1)
      .max(200)
      .optional(),
  })
  .strict();

export const rejectMaterialReturnSchema = z
  .object({
    reason: z.string().trim().min(1, 'Reason is required.').max(1000, 'Reason must be 1000 characters or fewer.'),
  })
  .strict();
