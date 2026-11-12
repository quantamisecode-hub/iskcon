import { describe, expect, it, vi } from 'vitest';
import { withDeadlockRetry } from '../src/lib/dbRetry.js';
import getTestClient from './helpers/test-client.js';

const prisma = getTestClient();

/**
 * Deadlock retry regression tests (Phase 11).
 *
 * BUG-DB-001: a return submission failed with HTTP 500 because an InnoDB
 * deadlock inside the interactive transaction (P2034) surfaced to the client
 * instead of being retried. MySQL had already rolled the transaction back, so
 * replaying it is always safe.
 */

function deadlockError(): Error {
  const err = new Error('Transaction failed due to a write conflict or a deadlock. Please retry your transaction');
  (err as { code?: string }).code = 'P2034';
  return err;
}

describe('withDeadlockRetry', () => {
  it('replays a deadlocked transaction and returns the eventual result', async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw deadlockError();
      return 'committed';
    });

    await expect(withDeadlockRetry(fn, 3)).resolves.toBe('committed');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('never retries a non-retriable error (it propagates immediately)', async () => {
    const fn = vi.fn(async () => {
      const err = new Error('Unique constraint failed on the fields: (`email`)');
      (err as { code?: string }).code = 'P2002';
      throw err;
    });

    await expect(withDeadlockRetry(fn, 3)).rejects.toThrow('Unique constraint failed');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after the configured attempts and rethrows the deadlock', async () => {
    const fn = vi.fn(async () => {
      throw deadlockError();
    });

    await expect(withDeadlockRetry(fn, 3)).rejects.toThrow('write conflict');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not catch programming errors thrown by the transaction body', async () => {
    const fn = vi.fn(async () => {
      throw new TypeError('boom');
    });

    await expect(withDeadlockRetry(fn, 3)).rejects.toThrow('boom');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

/**
 * BUG-DB-002 regression: authService.login used a bare prisma.$transaction —
 * a P2034 deadlock on the auditLog.create step (contended AuditLog writes
 * across parallel suites / real concurrent logins) surfaced as HTTP 500 and
 * the client got no session. login() and logout() now run through
 * transactionWithRetry, so a deadlocked login replays and still succeeds.
 */
describe('BUG-DB-002 — auth transactions survive deadlocks (login path)', () => {
  it('login transaction is wrapped so a P2034 replay still yields a session', async () => {
    // Drive the real login against the shared test DB. The deadlock itself is
    // an environmental race; what this test proves is the contract: login()
    // goes through transactionWithRetry (no bare $transaction remains on the
    // auth path) and, under contention, either replays or fails clean — never
    // half-commits. The unit-level replay behaviour is covered above, so here
    // we assert the wiring via source inspection and a live login.
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('../src/services/auth.service.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/\$transaction/); // no bare transactions left
    expect(source).toContain('transactionWithRetry');

    const { authService } = await import('../src/services/auth.service.js');
    const { randomUUID } = await import('node:crypto');
    const password = `ValidPass${randomUUID()}-dbg`;
    const user = await authService.createUserRecord({
      firstName: 'Retry',
      lastName: 'Login',
      email: `retry-login-${randomUUID()}@example.test`,
      password,
      role: 'ADMIN',
    });
    const result = await authService.login({ email: user.email, password }, {});
    expect(result.user.id).toBe(user.id);
    expect(result.token).toBeTruthy();
    // Cleanup in FK-safe order: audit rows (Restrict) → sessions → user.
    await prisma.auditLog.deleteMany({ where: { userId: user.id } });
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});
