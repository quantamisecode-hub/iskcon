import type { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import { logger } from '../utils/logger.js';

/**
 * Deadlock / write-conflict retry for interactive transactions.
 *
 * InnoDB resolves deadlocks by ROLLING ONE TRANSACTION BACK entirely; Prisma
 * surfaces that as P2034 ("Transaction failed due to a write conflict or a
 * deadlock. Please retry your transaction"). Because the transaction never
 * committed, replaying the WHOLE transaction is safe: no partial state exists
 * and no notification/audit/emission has happened yet (those all run after the
 * transaction returns).
 *
 * Only retriable errors are replayed — any other failure propagates unchanged.
 */

const DEFAULT_ATTEMPTS = 15;
const BASE_DELAY_MS = 50;

function isRetriableDbError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === 'P2034') return true;
  // Raw MySQL error codes surfaced by $queryRaw under lock contention:
  // 1213 = Deadlock found when trying to get lock
  // 1205 = Lock wait timeout exceeded
  if (e.code === '1213' || e.code === '1205') return true;
  const message = String(e.message ?? '');
  return message.includes('write conflict or a deadlock')
    || message.includes('Lock wait timeout exceeded')
    || message.includes('Deadlock found')
    || message.includes('deadlock');
}

export async function withDeadlockRetry<T>(fn: () => Promise<T>, attempts = DEFAULT_ATTEMPTS): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetriableDbError(err)) throw err;
      lastError = err;
      if (attempt < attempts) {
        logger.warn({ attempt, attempts }, 'Deadlock/write conflict — retrying transaction');
        await new Promise((resolve) => setTimeout(resolve, BASE_DELAY_MS * attempt));
      }
    }
  }
  throw lastError;
}

/**
 * Drop-in replacement for `prisma.$transaction(async (tx) => ...)` that
 * replays the transaction on deadlock. Same call shape, same semantics —
 * only the failure mode changes (retried instead of surfaced as a 500).
 *
 * Pass `isolationLevel` (e.g. Prisma.TransactionIsolationLevel.Serializable)
 * when stronger consistency guarantees are needed, such as the material-return
 * accept path which must serialize concurrent over-return checks.
 */
export function transactionWithRetry<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  isolationLevel?: Prisma.TransactionIsolationLevel,
): Promise<T> {
  return withDeadlockRetry(() => prisma.$transaction(fn, { isolationLevel }));
}
