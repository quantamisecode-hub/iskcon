import { z } from 'zod';

/** Shared field schemas. `.strict()` rejects unknown/unexpected fields. */

const NAME_PATTERN = /^[\p{L}][\p{L} .'-]{0,99}$/u;

export const firstNameField = z.string().trim().regex(NAME_PATTERN).max(100);
export const lastNameField = z.string().trim().regex(NAME_PATTERN).max(100);

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/)
  .max(254);

export const loginSchema = z
  .object({
    email: emailField,
    password: z.string().min(1).max(128),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;
