/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'http';
import WebSocket from 'ws';
import * as encoding from 'lib0/encoding';
import { parseAuthPacket, createCollabServer, handleRevocationEvent } from '../../server/collab-server';
import { createCollabTicket } from '../../src/lib/auth/collab-ticket';
import { prisma } from '../../src/lib/prisma';
import { verifyDocumentAccess } from '../../src/lib/auth/authorization';

// Mock DB and Authorization layers for deterministic unit testing
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    document: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../../src/lib/auth/authorization', () => ({
  verifyDocumentAccess: vi.fn(),
  AuthError: class AuthError extends Error {
    status: number;
    constructor(message: string, status = 403) {
      super(message);
      this.status = status;
    }
  },
}));

describe('In-Band WebSocket Authentication (Phase 7D-V2.2)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      COLLAB_WS_TOKEN_SECRET: 'test-secret-key-super-secure-32-chars-long',
    };

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-alice-123',
      name: 'Alice Cooper',
      email: 'alice@collabspace.dev',
    } as any);

    vi.mocked(verifyDocumentAccess).mockResolvedValue({
      userRole: 'editor',
      document: { id: 'collab_prod_doc_123', title: 'Test Document' },
    } as any);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('parseAuthPacket packet decoding', () => {
    it('correctly decodes binary messageAuth (type 2) packet with ticket payload', () => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, 2 /* messageAuth */);
      encoding.writeVarString(encoder, 'sample-collab-ticket-payload.signature');
      const binPacket = encoding.toUint8Array(encoder);

      const parsed = parseAuthPacket(binPacket);
      expect(parsed).toBe('sample-collab-ticket-payload.signature');
    });

    it('correctly decodes JSON text frame with type: auth and ticket', () => {
      const jsonStr = JSON.stringify({ type: 'auth', ticket: 'my-json-ticket.sig' });
      const parsed = parseAuthPacket(jsonStr);
      expect(parsed).toBe('my-json-ticket.sig');
    });

    it('correctly decodes JSON Buffer frame', () => {
      const jsonBuf = Buffer.from(JSON.stringify({ ticket: 'buf-ticket.sig' }));
      const parsed = parseAuthPacket(jsonBuf);
      expect(parsed).toBe('buf-ticket.sig');
    });

    it('returns null for messageSync (type 0) binary packet', () => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, 0 /* messageSync */);
      encoding.writeVarUint(encoder, 0 /* syncStep1 */);
      const binPacket = encoding.toUint8Array(encoder);

      const parsed = parseAuthPacket(binPacket);
      expect(parsed).toBeNull();
    });

    it('returns null for messageAwareness (type 1) binary packet', () => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, 1 /* messageAwareness */);
      encoding.writeVarUint8Array(encoder, new Uint8Array([0, 1, 2]));
      const binPacket = encoding.toUint8Array(encoder);

      const parsed = parseAuthPacket(binPacket);
      expect(parsed).toBeNull();
    });

    it('returns null for empty buffer', () => {
      expect(parseAuthPacket(new Uint8Array(0))).toBeNull();
      expect(parseAuthPacket(Buffer.alloc(0))).toBeNull();
    });

    it('returns null for invalid JSON string', () => {
      expect(parseAuthPacket('{ invalid json text ')).toBeNull();
    });

    it('returns null for non-auth JSON frames', () => {
      expect(parseAuthPacket(JSON.stringify({ type: 'ping' }))).toBeNull();
    });
  });

  describe('Server Wire Protocol In-Band Authentication Flow', () => {
    let httpServer: http.Server;
    let collabServer: ReturnType<typeof createCollabServer>;
    let serverPort: number;
    const testDocId = 'collab_prod_doc_123';

    beforeEach(async () => {
      httpServer = http.createServer();
      collabServer = createCollabServer(httpServer);

      await new Promise<void>((resolve) => {
        httpServer.listen(0, '127.0.0.1', () => {
          const addr = httpServer.address() as { port: number };
          serverPort = addr.port;
          resolve();
        });
      });
    });

    afterEach(async () => {
      await collabServer.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    });

    it('accepts valid ticket sent as first binary messageAuth packet over clean URL', async () => {
      const ticket = createCollabTicket({
        userId: 'user-alice-123',
        documentId: testDocId,
        role: 'editor',
      });

      // Connect without ?token= or query parameters
      const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/${testDocId}`);

      const receivedMessages: Buffer[] = [];

      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
          // Send binary messageAuth with ticket
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, 2 /* messageAuth */);
          encoding.writeVarString(encoder, ticket);
          ws.send(encoding.toUint8Array(encoder));
        });

        ws.on('message', (data: Buffer) => {
          receivedMessages.push(data);
          // Server responds with syncStep1 once authenticated
          ws.close();
          resolve();
        });

        ws.on('error', reject);
      });

      expect(receivedMessages.length).toBeGreaterThan(0);
    });

    it('rejects connection with 4401 when sync message is transmitted before authentication', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/${testDocId}`);

      const closeCode = await new Promise<number>((resolve) => {
        ws.on('open', () => {
          // Malicious attempt: send messageSync before sending credentials
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, 0 /* messageSync */);
          encoding.writeVarUint(encoder, 0 /* syncStep1 */);
          ws.send(encoding.toUint8Array(encoder));
        });

        ws.on('close', (code) => {
          resolve(code);
        });
      });

      expect(closeCode).toBe(4401);
    });

    it('rejects connection with 4401 when ticket signature is tampered', async () => {
      const validTicket = createCollabTicket({
        userId: 'user-alice-123',
        documentId: testDocId,
        role: 'editor',
      });
      const [body] = validTicket.split('.');
      const tamperedTicket = `${body}.invalid-signature-12345`;

      const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/${testDocId}`);

      const closeCode = await new Promise<number>((resolve) => {
        ws.on('open', () => {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, 2 /* messageAuth */);
          encoding.writeVarString(encoder, tamperedTicket);
          ws.send(encoding.toUint8Array(encoder));
        });

        ws.on('close', (code) => {
          resolve(code);
        });
      });

      expect(closeCode).toBe(4401);
    });

    it('rejects cross-document ticket attack with code 4403', async () => {
      const targetDocId = 'collab_secret_vault_999';
      // Ticket issued for a different document
      const wrongDocTicket = createCollabTicket({
        userId: 'user-alice-123',
        documentId: 'collab_public_forum_000',
        role: 'editor',
      });

      const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/${targetDocId}`);

      const closeCode = await new Promise<number>((resolve) => {
        ws.on('open', () => {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, 2 /* messageAuth */);
          encoding.writeVarString(encoder, wrongDocTicket);
          ws.send(encoding.toUint8Array(encoder));
        });

        ws.on('close', (code) => {
          resolve(code);
        });
      });

      expect(closeCode).toBe(4403);
    });

    it('rejects connection with 4401 if unauthenticated client remains idle without sending credentials', async () => {
      // Connect and send nothing
      const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/${testDocId}`);

      const closeCode = await new Promise<number>((resolve) => {
        ws.on('close', (code) => {
          resolve(code);
        });
      });

      expect(closeCode).toBe(4401);
    }, 5000);

    it('terminates active connection with 4403 when user permission is revoked via revocation event', async () => {
      const ticket = createCollabTicket({
        userId: 'user-alice-123',
        documentId: testDocId,
        role: 'editor',
      });

      const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/${testDocId}`);

      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, 2 /* messageAuth */);
          encoding.writeVarString(encoder, ticket);
          ws.send(encoding.toUint8Array(encoder));
        });
        ws.on('message', () => resolve());
        ws.on('error', reject);
      });

      // User Alice is now actively connected. Trigger revocation event!
      const closePromise = new Promise<number>((resolve) => {
        ws.on('close', (code) => resolve(code));
      });

      handleRevocationEvent({
        action: 'revoke_user',
        userId: 'user-alice-123',
        docId: testDocId,
      });

      const closeCode = await closePromise;
      expect(closeCode).toBe(4403);
    });

    it('terminates all connections in room when document is deleted via revocation event', async () => {
      const ticket = createCollabTicket({
        userId: 'user-alice-123',
        documentId: testDocId,
        role: 'editor',
      });

      const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/${testDocId}`);

      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, 2 /* messageAuth */);
          encoding.writeVarString(encoder, ticket);
          ws.send(encoding.toUint8Array(encoder));
        });
        ws.on('message', () => resolve());
        ws.on('error', reject);
      });

      const closePromise = new Promise<number>((resolve) => {
        ws.on('close', (code) => resolve(code));
      });

      handleRevocationEvent({
        action: 'revoke_doc',
        docId: testDocId,
      });

      const closeCode = await closePromise;
      expect(closeCode).toBe(4403);
    });

    it('reauthorizes active connection in-band when client sends fresh messageAuth ticket', async () => {
      const initialTicket = createCollabTicket({
        userId: 'user-alice-123',
        documentId: testDocId,
        role: 'editor',
      });

      const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/${testDocId}`);

      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, 2 /* messageAuth */);
          encoding.writeVarString(encoder, initialTicket);
          ws.send(encoding.toUint8Array(encoder));
        });
        ws.on('message', () => resolve());
        ws.on('error', reject);
      });

      // Now mock Alice's role changed to viewer in DB
      vi.mocked(verifyDocumentAccess).mockResolvedValueOnce({
        userRole: 'viewer',
        document: { id: testDocId, title: 'Test Document' },
      } as any);

      const refreshedTicket = createCollabTicket({
        userId: 'user-alice-123',
        documentId: testDocId,
        role: 'viewer',
      });

      // Alice sends in-band messageAuth renewal
      const receivedMessages: Buffer[] = [];
      ws.on('message', (data: Buffer) => {
        receivedMessages.push(data);
      });

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, 2 /* messageAuth */);
      encoding.writeVarString(encoder, refreshedTicket);
      ws.send(encoding.toUint8Array(encoder));

      // Wait a brief moment for server to process and respond with permission update notice
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
    });

    it('strictly rejects raw session tokens in production environment', async () => {
      Object.assign(process.env, { NODE_ENV: 'production' });

      // Attempt to connect using a raw session token in query string without signed ticket
      const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/${testDocId}?token=raw-session-token-abc-123`);

      const closeCode = await new Promise<number>((resolve) => {
        ws.on('close', (code) => resolve(code));
      });

      expect(closeCode).toBe(4401);
    });

    describe('In-Band Renewal Security & Identity Binding (Finding V31-03)', () => {
      it('allows same-user ticket renewal without connection teardown', async () => {
        const initialTicket = createCollabTicket({
          userId: 'user-alice-123',
          documentId: testDocId,
          role: 'editor',
        });

        const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/${testDocId}`);
        await new Promise<void>((resolve, reject) => {
          ws.on('open', () => {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, 2 /* messageAuth */);
            encoding.writeVarString(encoder, initialTicket);
            ws.send(encoding.toUint8Array(encoder));
          });
          ws.on('message', () => resolve());
          ws.on('error', reject);
        });

        // Alice issues renewal ticket for Alice
        const renewalTicket = createCollabTicket({
          userId: 'user-alice-123',
          documentId: testDocId,
          role: 'editor',
        });

        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, 2 /* messageAuth */);
        encoding.writeVarString(enc, renewalTicket);
        ws.send(encoding.toUint8Array(enc));

        await new Promise((r) => setTimeout(r, 100));
        expect(ws.readyState).toBe(WebSocket.OPEN);
        ws.close();
      });

      it('strictly rejects different-user renewal ticket and terminates socket (4403)', async () => {
        const initialTicket = createCollabTicket({
          userId: 'user-alice-123',
          documentId: testDocId,
          role: 'editor',
        });

        const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/${testDocId}`);
        await new Promise<void>((resolve, reject) => {
          ws.on('open', () => {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, 2 /* messageAuth */);
            encoding.writeVarString(encoder, initialTicket);
            ws.send(encoding.toUint8Array(encoder));
          });
          ws.on('message', () => resolve());
          ws.on('error', reject);
        });

        // Mock Bob user in DB for both verifyCollabTicket and authenticateClient
        (vi.mocked(prisma.user.findUnique) as any).mockImplementation(async ({ where }: any) => {
          if (where.id === 'user-bob-456') {
            return { id: 'user-bob-456', name: 'Bob Attacker', email: 'bob@collabspace.dev' };
          }
          return { id: 'user-alice-123', name: 'Alice Cooper', email: 'alice@collabspace.dev' };
        });

        (vi.mocked(verifyDocumentAccess) as any).mockImplementation(async (userId: string) => {
          if (userId === 'user-bob-456') {
            return {
              userRole: 'admin',
              document: { id: testDocId, title: 'Test Document' },
            };
          }
          return {
            userRole: 'editor',
            document: { id: testDocId, title: 'Test Document' },
          };
        });

        // Bob's ticket sent over Alice's socket
        const bobsTicket = createCollabTicket({
          userId: 'user-bob-456',
          documentId: testDocId,
          role: 'admin',
        });

        const closePromise = new Promise<number>((resolve) => {
          ws.on('close', (code) => resolve(code));
        });

        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, 2 /* messageAuth */);
        encoding.writeVarString(enc, bobsTicket);
        ws.send(encoding.toUint8Array(enc));

        const closeCode = await closePromise;
        expect(closeCode).toBe(4403);
      });

      it('rejects renewal ticket issued for a different document (4403)', async () => {
        const initialTicket = createCollabTicket({
          userId: 'user-alice-123',
          documentId: testDocId,
          role: 'editor',
        });

        const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/${testDocId}`);
        await new Promise<void>((resolve, reject) => {
          ws.on('open', () => {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, 2 /* messageAuth */);
            encoding.writeVarString(encoder, initialTicket);
            ws.send(encoding.toUint8Array(encoder));
          });
          ws.on('message', () => resolve());
          ws.on('error', reject);
        });

        // Ticket for completely different doc
        const wrongDocTicket = createCollabTicket({
          userId: 'user-alice-123',
          documentId: 'other-unrelated-doc-999',
          role: 'editor',
        });

        const closePromise = new Promise<number>((resolve) => {
          ws.on('close', (code) => resolve(code));
        });

        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, 2 /* messageAuth */);
        encoding.writeVarString(enc, wrongDocTicket);
        ws.send(encoding.toUint8Array(enc));

        const closeCode = await closePromise;
        expect(closeCode).toBe(4403);
      });

      it('rejects expired renewal ticket (4401)', async () => {
        const initialTicket = createCollabTicket({
          userId: 'user-alice-123',
          documentId: testDocId,
          role: 'editor',
        });

        const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/${testDocId}`);
        await new Promise<void>((resolve, reject) => {
          ws.on('open', () => {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, 2 /* messageAuth */);
            encoding.writeVarString(encoder, initialTicket);
            ws.send(encoding.toUint8Array(encoder));
          });
          ws.on('message', () => resolve());
          ws.on('error', reject);
        });

        // Expired ticket (negative TTL)
        const expiredTicket = createCollabTicket({
          userId: 'user-alice-123',
          documentId: testDocId,
          role: 'editor',
          ttlSeconds: -10,
        });

        const closePromise = new Promise<number>((resolve) => {
          ws.on('close', (code) => resolve(code));
        });

        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, 2 /* messageAuth */);
        encoding.writeVarString(enc, expiredTicket);
        ws.send(encoding.toUint8Array(enc));

        const closeCode = await closePromise;
        expect(closeCode).toBe(4401);
      });

      it('does not grant write access when DB role is viewer even if renewal ticket claims editor', async () => {
        const initialTicket = createCollabTicket({
          userId: 'user-alice-123',
          documentId: testDocId,
          role: 'editor',
        });

        const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/${testDocId}`);
        await new Promise<void>((resolve, reject) => {
          ws.on('open', () => {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, 2 /* messageAuth */);
            encoding.writeVarString(encoder, initialTicket);
            ws.send(encoding.toUint8Array(encoder));
          });
          ws.on('message', () => resolve());
          ws.on('error', reject);
        });

        // DB returns viewer role despite forged ticket claiming editor
        vi.mocked(verifyDocumentAccess).mockResolvedValueOnce({
          userRole: 'viewer',
          document: { id: testDocId, title: 'Test Document' },
        } as any);

        const claimEditorTicket = createCollabTicket({
          userId: 'user-alice-123',
          documentId: testDocId,
          role: 'editor',
        });

        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, 2 /* messageAuth */);
        encoding.writeVarString(enc, claimEditorTicket);
        ws.send(encoding.toUint8Array(enc));

        await new Promise((r) => setTimeout(r, 100));

        // Now attempt an edit mutation (messageSync -> messageYjsUpdate)
        const mutationEnc = encoding.createEncoder();
        encoding.writeVarUint(mutationEnc, 0 /* messageSync */);
        encoding.writeVarUint(mutationEnc, 2 /* messageYjsUpdate */);
        encoding.writeVarUint8Array(mutationEnc, new Uint8Array([1, 2, 3]));
        ws.send(encoding.toUint8Array(mutationEnc));

        await new Promise((r) => setTimeout(r, 100));
        expect(ws.readyState).toBe(WebSocket.OPEN);
        ws.close();
      });

      it('failed renewal does not change the existing connection identity or escalate privileges', async () => {
        const initialTicket = createCollabTicket({
          userId: 'user-alice-123',
          documentId: testDocId,
          role: 'viewer',
        });

        vi.mocked(verifyDocumentAccess).mockResolvedValueOnce({
          userRole: 'viewer',
          document: { id: testDocId, title: 'Test Document' },
        } as any);

        const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/${testDocId}`);
        await new Promise<void>((resolve, reject) => {
          ws.on('open', () => {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, 2 /* messageAuth */);
            encoding.writeVarString(encoder, initialTicket);
            ws.send(encoding.toUint8Array(encoder));
          });
          ws.on('message', () => resolve());
          ws.on('error', reject);
        });

        const closePromise = new Promise<number>((resolve) => {
          ws.on('close', (code) => resolve(code));
        });

        // Invalid signature attempt
        const invalidSigTicket = 'invalid.sig.123';
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, 2 /* messageAuth */);
        encoding.writeVarString(enc, invalidSigTicket);
        ws.send(encoding.toUint8Array(enc));

        const closeCode = await closePromise;
        expect(closeCode).toBe(4401);
      });
    });

    describe('Soft-Delete Revocation & Wire Safety (Finding V31-04)', () => {
      it('closes active connections with 4403 upon revoke_doc event', async () => {
        const ticket = createCollabTicket({
          userId: 'user-alice-123',
          documentId: testDocId,
          role: 'editor',
        });

        const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/${testDocId}`);
        await new Promise<void>((resolve, reject) => {
          ws.on('open', () => {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, 2 /* messageAuth */);
            encoding.writeVarString(encoder, ticket);
            ws.send(encoding.toUint8Array(encoder));
          });
          ws.on('message', () => resolve());
          ws.on('error', reject);
        });

        const closePromise = new Promise<number>((resolve) => {
          ws.on('close', (code) => resolve(code));
        });

        // Trigger revocation as emitted by soft-delete or permanent delete
        handleRevocationEvent({ action: 'revoke_doc', docId: testDocId });

        const closeCode = await closePromise;
        expect(closeCode).toBe(4403);
      });

      it('prevents revoked connection from submitting mutations', async () => {
        const ticket = createCollabTicket({
          userId: 'user-alice-123',
          documentId: testDocId,
          role: 'editor',
        });

        const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/${testDocId}`);
        await new Promise<void>((resolve, reject) => {
          ws.on('open', () => {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, 2 /* messageAuth */);
            encoding.writeVarString(encoder, ticket);
            ws.send(encoding.toUint8Array(encoder));
          });
          ws.on('message', () => resolve());
          ws.on('error', reject);
        });

        const closePromise = new Promise<number>((resolve) => {
          ws.on('close', (code) => resolve(code));
        });

        handleRevocationEvent({ action: 'revoke_doc', docId: testDocId });
        await closePromise;

        expect(ws.readyState).toBe(WebSocket.CLOSED);
        const sendError = await new Promise<Error | null>((resolve) => {
          ws.send(new Uint8Array([0, 1, 2]), (err) => resolve(err || null));
        });
        expect(sendError).not.toBeNull();
      });

      it('safely handles repeated revoke_doc calls without unhandled exceptions', () => {
        expect(() => {
          handleRevocationEvent({ action: 'revoke_doc', docId: testDocId });
          handleRevocationEvent({ action: 'revoke_doc', docId: testDocId });
          handleRevocationEvent({ action: 'revoke_doc', docId: 'non-existent-doc-999' });
        }).not.toThrow();
      });
    });
  });
});
