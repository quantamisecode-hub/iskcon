import { z } from 'zod';

export const materialRequestStatusSchema = z.enum([
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'PARTIALLY_ISSUED',
  'ISSUED',
  'REJECTED',
  'CANCELLED',
  'CANCELLED_BY_EVENT',
] as const);

export const listMaterialRequestsQuerySchema = z
  .object({
    status: materialRequestStatusSchema.optional(),
    eventId: z.string().uuid().optional(),
    search: z.string().trim().max(200).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    sort: z.enum(['createdAt', 'eventDate', 'status']).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();

export const createMaterialRequestSchema = z
  .object({
    eventId: z.string().uuid(),
    notes: z.string().trim().max(2000).optional().nullable(),
    /** Executor-selected lines. Omitted = the whole committed plan (legacy behaviour). */
    items: z
      .array(
        z
          .object({
            eventMaterialId: z.string().uuid(),
            requestedQuantity: z.number().positive().max(999999999.999),
            remarks: z.string().trim().max(1000).optional().nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(200)
      .optional(),
  })
  .strict();

export const createAdditionalMaterialRequestSchema = z
  .object({
    /** Picklist-style reason; `Other` requires `note` (enforced in the service). */
    reason: z.string().trim().min(1, 'A reason is required.').max(100),
    note: z.string().trim().max(500).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
    /** Explicit parent (INITIAL) request; the service derives the latest one when omitted. */
    parentRequestId: z.string().uuid().optional().nullable(),
    items: z
      .array(
        z
          .object({
            eventMaterialId: z.string().uuid(),
            requestedQuantity: z.number().positive().max(999999999.999),
            remarks: z.string().trim().max(1000).optional().nullable(),
          })
          .strict(),
      )
      .min(1, 'Select at least one material.')
      .max(200),
  })
  .strict();

export const approveMaterialRequestSchema = z
  .object({
    /** Optional per-item approved quantities (partial approval). Omitted = approve all in full. */
    items: z
      .array(
        z
          .object({
            itemId: z.string().uuid(),
            approvedQuantity: z.number().min(0).max(999999999.999),
          })
          .strict(),
      )
      .min(1)
      .max(200)
      .optional(),
  })
  .strict();

export const issueMaterialRequestSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            itemId: z.string().uuid(),
            quantity: z.number().int().positive().max(999999999),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();

export const rejectMaterialRequestSchema = z
  .object({
    reason: z.string().trim().min(1, 'Reason is required.').max(1000, 'Reason must be 1000 characters or fewer.'),
  })
  .strict();

// Notifications
export const listNotificationsQuerySchema = z
  .object({
    // Not z.coerce.boolean(): that turns the query string "false" into true.
    unreadOnly: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const notificationParamsSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();
