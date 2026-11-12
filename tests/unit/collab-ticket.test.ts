/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createCollabTicket,
  verifyCollabTicket,
  consumeTicketId,
  _clearLocalConsumedTickets,
  CollabTicketPayload,
} from '../../src/lib/auth/collab-ticket';
import { prisma } from '../../src/lib/prisma';

// Mock database user lookup for unit testing
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

describe('WebSocket Authentication Ticket System (Phase 7D-V2.2)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, COLLAB_WS_TOKEN_SECRET: 'test-secret-key-super-secure-32-chars-long' };
    _clearLocalConsumedTickets();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-alice-123',
      name: 'Alice Cooper',
      email: 'alice@collabspace.dev',
    } as any);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it('generates a valid, cryptographically signed ticket that verifies cleanly', async () => {
    const ticket = createCollabTicket({
      userId: 'user-alice-123',
      documentId: 'doc-finance-2026',
      role: 'editor',
    });

    expect(typeof ticket).toBe('string');
    expect(ticket.split('.')).toHaveLength(2);

    const result = await verifyCollabTicket(ticket, 'doc-finance-2026');
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.payload.userId).toBe('user-alice-123');
      expect(result.payload.documentId).toBe('doc-finance-2026');
      expect(result.payload.role).toBe('editor');
      expect(result.payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    }
  });

  it('rejects an expired ticket when TTL has passed', async () => {
    // Issue ticket with -10 second TTL (already expired)
    const expiredTicket = createCollabTicket({
      userId: 'user-alice-123',
      documentId: 'doc-finance-2026',
      role: 'editor',
      ttlSeconds: -10,
    });

    const result = await verifyCollabTicket(expiredTicket, 'doc-finance-2026');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toMatch(/expired/i);
      expect(result.code).toBe(4401);
    }
  });

  it('rejects a ticket when the signature has been tampered with', async () => {
    const ticket = createCollabTicket({
      userId: 'user-alice-123',
      documentId: 'doc-finance-2026',
      role: 'editor',
    });

    const [body, sig] = ticket.split('.');
    const tamperedSig = sig.slice(0, -4) + 'abcd';
    const tamperedTicket = `${body}.${tamperedSig}`;

    const result = await verifyCollabTicket(tamperedTicket, 'doc-finance-2026');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toMatch(/signature/i);
      expect(result.code).toBe(4401);
    }
  });

  it('rejects a ticket when payload claims have been altered', async () => {
    const ticket = createCollabTicket({
      userId: 'user-alice-123',
      documentId: 'doc-finance-2026',
      role: 'viewer',
    });

    const [bodyB64, sig] = ticket.split('.');
    const rawPayload: CollabTicketPayload = JSON.parse(
      Buffer.from(bodyB64, 'base64url').toString('utf-8')
    );
    // Malicious escalation: change role from viewer to owner
    rawPayload.role = 'owner';
    const tamperedBody = Buffer.from(JSON.stringify(rawPayload)).toString('base64url');
    const tamperedTicket = `${tamperedBody}.${sig}`;

    const result = await verifyCollabTicket(tamperedTicket, 'doc-finance-2026');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toMatch(/signature/i);
      expect(result.code).toBe(4401);
    }
  });

  it('strictly rejects a ticket when presented to a different document ID (cross-document attack)', async () => {
    const ticket = createCollabTicket({
      userId: 'user-alice-123',
      documentId: 'doc-secret-a',
      role: 'editor',
    });

    // Attempting to use Doc A's ticket to join Doc B
    const result = await verifyCollabTicket(ticket, 'doc-secret-b');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toMatch(/does not match requested room/i);
      expect(result.code).toBe(4403);
    }
  });

  it('rejects a ticket if the underlying database user has been deleted', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const ticket = createCollabTicket({
      userId: 'user-deleted-999',
      documentId: 'doc-finance-2026',
      role: 'editor',
    });

    const result = await verifyCollabTicket(ticket, 'doc-finance-2026');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toMatch(/no longer exists/i);
      expect(result.code).toBe(4401);
    }
  });

  it('safely rejects malformed or empty ticket strings without throwing', async () => {
    expect((await verifyCollabTicket('', 'doc-1')).valid).toBe(false);
    expect((await verifyCollabTicket('single-token-without-dot', 'doc-1')).valid).toBe(false);
    expect((await verifyCollabTicket('a.b.c', 'doc-1')).valid).toBe(false);
    expect((await verifyCollabTicket('invalidB64.invalidSig', 'doc-1')).valid).toBe(false);
  });

  describe('Single-Use Ticket Replay Protection (Phase 7D-V2.2.2)', () => {
    it('strictly rejects ticket replay when the exact same ticket is verified a second time', async () => {
      const ticket = createCollabTicket({
        userId: 'user-alice-123',
        documentId: 'doc-finance-2026',
        role: 'editor',
      });

      // First verification: valid and consumes the ticket
      const firstResult = await verifyCollabTicket(ticket, 'doc-finance-2026');
      expect(firstResult.valid).toBe(true);

      // Second verification (replay attack attempt)
      const secondResult = await verifyCollabTicket(ticket, 'doc-finance-2026');
      expect(secondResult.valid).toBe(false);
      if (!secondResult.valid) {
        expect(secondResult.error).toMatch(/already consumed|replay/i);
        expect(secondResult.code).toBe(4401);
      }
    });

    it('allows read-only introspection without replay consumption when consumeReplay is false', async () => {
      const ticket = createCollabTicket({
        userId: 'user-alice-123',
        documentId: 'doc-finance-2026',
        role: 'editor',
      });

      // Read-only introspection
      const first = await verifyCollabTicket(ticket, 'doc-finance-2026', { consumeReplay: false });
      expect(first.valid).toBe(true);

      // Second read-only check remains valid
      const second = await verifyCollabTicket(ticket, 'doc-finance-2026', { consumeReplay: false });
      expect(second.valid).toBe(true);

      // Third check with default consumption consumes it
      const third = await verifyCollabTicket(ticket, 'doc-finance-2026');
      expect(third.valid).toBe(true);

      // Fourth check is now rejected as replay
      const fourth = await verifyCollabTicket(ticket, 'doc-finance-2026');
      expect(fourth.valid).toBe(false);
    });

    it('atomically rejects duplicate nonce consumption via mock Redis client', async () => {
      const mockRedis = {
        set: vi.fn()
          .mockResolvedValueOnce('OK') // First call succeeds
          .mockResolvedValueOnce(null), // Second call encounters existing key
      };

      const now = Math.floor(Date.now() / 1000);
      const res1 = await consumeTicketId('unique-nonce-123', now + 60, { redisClient: mockRedis });
      expect(res1.consumed).toBe(true);

      const res2 = await consumeTicketId('unique-nonce-123', now + 60, { redisClient: mockRedis });
      expect(res2.consumed).toBe(false);
      expect(res2.error).toMatch(/already consumed/i);
    });

    it('fails closed in production if Redis is required and unavailable', async () => {
      Object.assign(process.env, { NODE_ENV: 'production' });
      const mockBrokenRedis = {
        set: vi.fn().mockRejectedValue(new Error('Connection lost')),
      };

      const now = Math.floor(Date.now() / 1000);
      const res = await consumeTicketId('ticket-test-prod', now + 60, { redisClient: mockBrokenRedis });
      expect(res.consumed).toBe(false);
      expect(res.error).toMatch(/temporarily unavailable/i);
    });

    it('generates distinct nonces and jti for tickets issued in the same second', () => {
      const t1 = createCollabTicket({ userId: 'u1', documentId: 'd1', role: 'editor' });
      const t2 = createCollabTicket({ userId: 'u1', documentId: 'd1', role: 'editor' });

      expect(t1).not.toBe(t2);

      const p1 = JSON.parse(Buffer.from(t1.split('.')[0], 'base64url').toString('utf-8'));
      const p2 = JSON.parse(Buffer.from(t2.split('.')[0], 'base64url').toString('utf-8'));

      expect(p1.nonce).not.toBe(p2.nonce);
      expect(p1.jti).toBeDefined();
      expect(p2.jti).toBeDefined();
      expect(p1.jti).not.toBe(p2.jti);
    });
  });
});
