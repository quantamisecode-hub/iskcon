import { z } from 'zod';
import { firstNameField, lastNameField, emailField } from './auth.validator.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const idParamsSchema = z
  .object({
    id: z.string().regex(UUID_PATTERN),
  })
  .strict();

export const createUserSchema = z
  .object({
    firstName: firstNameField,
    lastName: lastNameField,
    email: emailField,
    password: z.string().min(8).max(128),
    role: z.enum(['ADMIN', 'EXECUTOR']),
  })
  .strict();

export const updateUserSchema = z
  .object({
    firstName: firstNameField.optional(),
    lastName: lastNameField.optional(),
    email: emailField.optional(),
    role: z.enum(['ADMIN', 'EXECUTOR']).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'No fields to update.' });

export const updateUserStatusSchema = z
  .object({
    status: z.enum(['ACTIVE', 'INACTIVE']),
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    newPassword: z.string().min(8).max(128),
  })
  .strict();

/** List filters: query string validation. */
export const listUsersQuerySchema = z
  .object({
    role: z.enum(['ADMIN', 'EXECUTOR']).optional(),
    isActive: z.enum(['true', 'false']).optional().transform((v) => (v === undefined ? undefined : v === 'true')),
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
