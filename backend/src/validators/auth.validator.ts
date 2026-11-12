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

/** Profile update. Email change requires the current password (see service). */
export const profileUpdateSchema = z
  .object({
    firstName: firstNameField.optional(),
    lastName: lastNameField.optional(),
    email: emailField.optional(),
    currentPassword: z.string().min(1).max(128).optional(),
  })
  .strict();

/** Password change. New password validated against the password policy in the service. */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(8).max(128),
  })
  .strict();

/**
 * Avatar upload. Client crops to a square JPEG (~256px, <=150KB) and sends a
 * data URL. `null` removes the avatar. Size cap enforced here AND in the service.
 */
export const AVATAR_MAX_BYTES = 200_000; // base64 length guard (~150KB binary)
const DATA_URL_PATTERN = /^data:image\/(png|jpeg|jpg|webp);base64,[a-zA-Z0-9+/=]+$/;

export const avatarUpdateSchema = z
  .object({
    avatarUrl: z
      .string()
      .max(AVATAR_MAX_BYTES, 'Image is too large (max ~150KB after compression)')
      .regex(DATA_URL_PATTERN, 'Avatar must be a PNG/JPEG/WebP data URL')
      .nullable(),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;
