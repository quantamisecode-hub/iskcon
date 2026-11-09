import { hash, verify, Algorithm } from '@node-rs/argon2';

/**
 * PASSWORD SECURITY
 *
 * Algorithm: Argon2id (pre-built native binding - no compilers required).
 * Parameters follow the OWASP minimum recommendation:
 *   memory 19 MiB, time cost 2, parallelism 1.
 *
 * Guarantees:
 *  - Plaintext passwords NEVER leave this module's function parameters.
 *  - Only hashes are ever persisted.
 *  - Tokens/hashes are never logged (see logger redact list).
 */

const ARGON2ID_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456, // KiB (~19 MiB)
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2ID_OPTIONS);
}

/** Constant-time-ish verification; returns false on any malformed input. */
export async function verifyPassword(passwordHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(passwordHash, plain, ARGON2ID_OPTIONS);
  } catch {
    // Corrupt/legacy hash text - treat as failed authentication.
    return false;
  }
}

/** Passwords that must never be accepted, regardless of policy passing. */
const COMMON_WEAK_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789',
  'qwerty123', 'admin123', 'welcome123', 'letmein123', 'iloveyou2',
]);

/** Business password policy: min 8 chars, mixed case or digit+letter. */
export function checkPasswordPolicy(plain: string): { ok: true } | { ok: false; reason: string } {
  if (COMMON_WEAK_PASSWORDS.has(plain.toLowerCase())) {
    return { ok: false, reason: 'This password is too commonly used.' };
  }
  if (plain.length < 8) {
    return { ok: false, reason: 'Password must be at least 8 characters long.' };
  }
  if (plain.length > 128) {
    return { ok: false, reason: 'Password must be at most 128 characters long.' };
  }
  const hasLower = /[a-z]/.test(plain);
  const hasUpper = /[A-Z]/.test(plain);
  const hasDigit = /\d/.test(plain);
  if (!hasLower || (!hasUpper && !hasDigit)) {
    return { ok: false, reason: 'Password must contain at least one letter and one number or capital letter.' };
  }
  return { ok: true };
}
