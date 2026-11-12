import { z } from 'zod';

/**
 * Shared field schemas for events, dishes, materials and calendar queries.
 * `.strict()` everywhere: unexpected fields are rejected (no mass assignment).
 */

export const EVENT_STATUSES = ['DRAFT', 'PLANNING', 'READY', 'COMPLETED', 'CANCELLED'] as const;

export const eventDateField = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'eventDate must be YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), {
    message: 'eventDate must be a valid calendar date',
  });

export const timeField = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time must be HH:MM (24h)');

export const createEventSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional().nullable(),
    eventDate: eventDateField,
    startTime: timeField,
    endTime: timeField.optional().nullable(),
    numberOfPeople: z.coerce.number().int().gt(0),
    location: z.string().trim().max(200).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
    status: z.enum(['DRAFT', 'PLANNING']).optional(),
  })
  .strict()
  .refine(
    (data) => !data.endTime || data.endTime >= data.startTime,
    { message: 'endTime must be greater than or equal to startTime', path: ['endTime'] },
  );

export const updateEventSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).optional().nullable(),
    eventDate: eventDateField.optional(),
    startTime: timeField.optional(),
    endTime: timeField.optional().nullable(),
    numberOfPeople: z.coerce.number().int().gt(0).optional(),
    location: z.string().trim().max(200).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
  })
  .strict()
  .refine(
    (data) => !data.startTime || !data.endTime || data.endTime >= data.startTime,
    { message: 'endTime must be greater than or equal to startTime', path: ['endTime'] },
  );

export const changeEventStatusSchema = z
  .object({
    status: z.enum(EVENT_STATUSES),
    /** Optional cancellation reason; POST /events/:id/cancel requires it. */
    reason: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();

/** §28: cancellation always carries a mandatory reason. */
export const cancelEventSchema = z
  .object({
    reason: z.string().trim().min(1, 'A cancellation reason is required.').max(1000),
  })
  .strict();

const sortFieldSchema = z.enum(['eventDate', 'name', 'createdAt', 'status', 'numberOfPeople', 'eventCode']);

export const listEventsQuerySchema = z
  .object({
    search: z.string().trim().max(200).optional(),
    status: z.enum(EVENT_STATUSES).optional(),
    dateFrom: eventDateField.optional(),
    dateTo: eventDateField.optional(),
    adminId: z.string().uuid().optional(),
    createdBy: z.string().uuid().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    sort: sortFieldSchema.default('eventDate'),
    order: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict()
  .refine(
    (data) => !data.dateFrom || !data.dateTo || data.dateTo >= data.dateFrom,
    { message: 'dateTo must be on or after dateFrom', path: ['dateTo'] },
  );

export const calendarQuerySchema = z
  .object({
    from: eventDateField,
    to: eventDateField,
  })
  .strict()
  .refine((data) => data.to >= data.from, { message: 'to must be on or after from', path: ['to'] });

export const createDishSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional().nullable(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const updateDishSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).optional().nullable(),
  })
  .strict();

export const dishStatusSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

const quantitySchema = z.coerce
  .number()
  .gt(0, 'Quantity must be greater than zero')
  .max(1_000_000_000, 'Quantity is too large');

export const createDishMaterialSchema = z
  .object({
    foodItemId: z.string().uuid(),
    quantityPerPerson: quantitySchema.optional().nullable(),
    unitId: z.string().uuid().optional(),
  })
  .strict();

export const updateDishMaterialSchema = z
  .object({
    quantityPerPerson: quantitySchema.optional().nullable(),
    unitId: z.string().uuid().optional(),
  })
  .strict();

export const createEventDishSchema = z
  .object({
    dishId: z.string().uuid(),
    notes: z.string().trim().max(1000).optional().nullable(),
    displayOrder: z.coerce.number().int().min(0).optional(),
  })
  .strict();

export const updateEventDishSchema = z
  .object({
    displayOrder: z.coerce.number().int().min(0).optional(),
    notes: z.string().trim().max(1000).optional().nullable(),
  })
  .strict();

export const createEventMaterialSchema = z
  .object({
    foodItemId: z.string().uuid(),
    plannedQuantity: quantitySchema,
    unitId: z.string().uuid().optional(),
    notes: z.string().trim().max(1000).optional().nullable(),
    isDraft: z.boolean().optional(),
  })
  .strict();

export const updateEventMaterialSchema = z
  .object({
    plannedQuantity: quantitySchema.optional(),
    unitId: z.string().uuid().optional(),
    notes: z.string().trim().max(1000).optional().nullable(),
    isDraft: z.boolean().optional(),
  })
  .strict();

export const listDishesQuerySchema = z
  .object({
    search: z.string().trim().max(200).optional(),
    isActive: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

/** Route parameter schemas (UUID ids). */
export const eventDishesMaterialParamsSchema = z.object({ eventDishId: z.string().uuid() }).strict();
export const eventIdParamsSchema = z.object({ id: z.string().uuid() }).strict();
/** Nested routes that carry the event id as `eventId` (e.g. additional requests, returns). */
export const eventNestedParamsSchema = z.object({ eventId: z.string().uuid() }).strict();
export const eventDishParamsSchema = z
  .object({ id: z.string().uuid(), eventDishId: z.string().uuid() })
  .strict();
export const eventDishIdParamsSchema = z.object({ eventDishId: z.string().uuid() }).strict();
export const eventDishMaterialParamsSchema = z
  .object({ eventDishId: z.string().uuid(), id: z.string().uuid() })
  .strict();
export const dishIdParamsSchema = z.object({ id: z.string().uuid() }).strict();
export const dishMaterialParamsSchema = z
  .object({ id: z.string().uuid(), materialId: z.string().uuid() })
  .strict();
