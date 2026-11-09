import { createHash, randomBytes } from 'node:crypto';

/**
 * SESSION TOKEN SECURITY
 *
 * - Tokens are 256-bit random values (unguessable).
 * - The DATABASE stores only their SHA-256 hash, so a database read
 *   alone never exposes a replayable token.
 * - No signing secret is required: secrecy comes from token ENTROPY,
 *   which is why no SESSION_SECRET variable exists.
 */

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
