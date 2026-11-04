/**
 * Comprehensive Multi-User Collaboration Test Suite
 *
 * Verifies:
 * 1. Architecture: Dedicated persistent WebSocket collaboration service with Yjs CRDT
 * 2. Real-time multi-user editing: Simultaneous typing, concurrent merging, zero last-write-wins overwriting
 * 3. Ephemeral awareness & presence: Live collaborator list, unique colors, cursor positions, disconnect cleanup
 * 4. WebSocket security & RBAC: Token authentication, room authorization, wire-level viewer mutation blocking
 * 5. Durability & persistence: PostgreSQL yjsState storage, cold server restart recovery, no lost updates
 * 6. Offline reconciliation: Offline edits sync and merge deterministically upon reconnection
 */

import { WebSocket } from 'ws';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import * as syncProtocol from 'y-protocols/sync';
import * as authProtocol from 'y-protocols/auth';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import http from 'http';
import { prisma } from '../src/lib/prisma';
import { generateSecureToken, hashToken } from '../src/lib/auth/crypto';
import { createCollabServer, docs } from '../server/collab-server';

const messageSync = 0;
const messageAuth = 2;

const TEST_PORT = 1238;
const TEST_WS_URL = `ws://127.0.0.1:${TEST_PORT}`;

// Helper: Create a test user with a database session
async function createTestUserWithSession(email: string, name: string) {
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash: 'test-hash-collab',
        emailVerified: new Date(),
      },
    });
  }

  const rawToken = generateSecureToken();
  const tokenHash = hashToken(rawToken);

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      sessionToken: tokenHash,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      userAgent: 'CollabTestSuite/1.0',
    },
  });

  return { user, session, rawToken };
}

// Helper: Create a real WebsocketProvider client matching TipTap & browser client
function createCollabClient(docId: string, token: string, existingDoc?: Y.Doc) {
  const ydoc = existingDoc || new Y.Doc();
  const provider = new WebsocketProvider(TEST_WS_URL, docId, ydoc, {
    params: { token },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    WebSocketPolyfill: WebSocket as any,
    disableBc: true,
  });

  let isSynced = false;
  provider.on('sync', (synced: boolean) => {
    isSynced = synced;
  });

  return {
    provider,
    ydoc,
    get isSynced() {
      return isSynced;
    },
  };
}

// Helper: Wait for condition
async function waitFor(fn: () => boolean, timeoutMs = 4000, intervalMs = 50): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

async function runCollaborationSuite() {
  console.log('\n===============================================================');
  console.log('   COLLABSPACE REAL-TIME COLLABORATION & CRDT TEST SUITE   ');
  console.log('===============================================================\n');

  // -----------------------------------------------------------------
  // 0. Setup: Users, Workspaces, and Collab Server
  // -----------------------------------------------------------------
  console.log('--- Step 0: Setting up test environment & database fixtures ---');
  const alice = await createTestUserWithSession('alice-collab@test.dev', 'Alice Owner');
  const bob = await createTestUserWithSession('bob-collab@test.dev', 'Bob Editor');
  const charlie = await createTestUserWithSession('charlie-collab@test.dev', 'Charlie Viewer');
  const eve = await createTestUserWithSession('eve-outsider@test.dev', 'Eve Outsider');

  // Create Workspace
  const workspace = await prisma.workspace.create({
    data: {
      name: 'Collab CRDT Workspace',
      slug: `collab-test-${Date.now()}`,
      ownerId: alice.user.id,
      members: {
        create: [
          { userId: bob.user.id, role: 'editor' },
          { userId: charlie.user.id, role: 'viewer' },
        ],
      },
    },
  });

  // Create Document in Workspace
  const document = await prisma.document.create({
    data: {
      title: 'Real-time CRDT Specification',
      workspaceId: workspace.id,
      authorId: alice.user.id,
      content: '<p>Initial baseline document</p>',
    },
  });
  const docId = document.id;
  console.log(`[Setup] Document ID: ${docId}`);

  // Start dedicated collaboration server
  let httpServer = http.createServer();
  let collabServer = createCollabServer(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(TEST_PORT, resolve));
  console.log(`[Setup] Collab Server started on port ${TEST_PORT}\n`);

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`  ✓ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${desc}`);
      failed++;
    }
  }

  try {
    // -----------------------------------------------------------------
    // TEST 1: Authentication & Authorization Security
    // -----------------------------------------------------------------
    console.log('--- TEST 1: WebSocket Security & Access Authorization ---');
    {
      // 1.1 Unauthenticated client (no token) must be rejected with 4401
      let noTokenClosedCode: number | null = null;
      const unauthClient = new WebSocket(`${TEST_WS_URL}/${docId}`);
      unauthClient.on('close', (code) => {
        noTokenClosedCode = code;
      });
      await waitFor(() => noTokenClosedCode !== null);
      assert(noTokenClosedCode === 4401, 'Unauthenticated connection rejected with code 4401');

      // 1.2 Invalid token must be rejected with 4401
      let invalidTokenClosedCode: number | null = null;
      const invalidClient = new WebSocket(`${TEST_WS_URL}/${docId}?token=invalid-secret-token-xyz`);
      invalidClient.on('close', (code) => {
        invalidTokenClosedCode = code;
      });
      await waitFor(() => invalidTokenClosedCode !== null);
      assert(invalidTokenClosedCode === 4401, 'Invalid session token rejected with code 4401');

      // 1.3 Outsider Eve (valid session, but no access to this document) must be rejected with 4403
      let outsiderClosedCode: number | null = null;
      const outsiderClient = new WebSocket(`${TEST_WS_URL}/${docId}?token=${eve.rawToken}`);
      outsiderClient.on('close', (code) => {
        outsiderClosedCode = code;
      });
      await waitFor(() => outsiderClosedCode !== null);
      assert(outsiderClosedCode === 4403, 'Outsider access without workspace membership rejected with code 4403');

      // 1.4 Authorized Editor Bob connects successfully
      const bobClient = createCollabClient(docId, bob.rawToken);
      await waitFor(() => bobClient.provider.wsconnected && bobClient.isSynced);
      assert(bobClient.provider.wsconnected, 'Authorized collaborator (Editor Bob) connects successfully');
      bobClient.provider.destroy();
    }
    console.log();

    // -----------------------------------------------------------------
    // TEST 2: Real-Time Multi-User Editing & Concurrent CRDT Merging
    // -----------------------------------------------------------------
    console.log('--- TEST 2: Multi-User Concurrent Editing & CRDT Convergence ---');
    {
      const clientA = createCollabClient(docId, alice.rawToken);
      const clientB = createCollabClient(docId, bob.rawToken);

      await waitFor(() => clientA.isSynced && clientB.isSynced);

      // Access shared Y.Text fragment
      const textA = clientA.ydoc.getText('content');
      const textB = clientB.ydoc.getText('content');

      // Client A types "Collab "
      textA.insert(0, 'Collab ');

      // Verify Client B receives it in real time without refreshing
      await waitFor(() => textB.toString().includes('Collab '));
      assert(textB.toString().includes('Collab '), 'Client B receives real-time edits from Client A without refresh');

      // Concurrent Edits:
      // Client A appends "Engine "
      // Client B concurrently appends "Production "
      textA.insert(textA.length, 'Engine ');
      textB.insert(textB.length, 'Production ');

      // Wait for CRDT convergence
      await waitFor(() => textA.toString() === textB.toString() && textA.toString().includes('Engine') && textA.toString().includes('Production'));

      assert(textA.toString() === textB.toString(), 'Both clients converge to identical state without conflicts');
      assert(
        textA.toString().includes('Engine') && textA.toString().includes('Production'),
        'Zero last-write-wins: both concurrent edits are preserved by Yjs CRDT'
      );

      clientA.provider.destroy();
      clientB.provider.destroy();
    }
    console.log();

    // -----------------------------------------------------------------
    // TEST 3: Ephemeral Awareness & Presence Protocol
    // -----------------------------------------------------------------
    console.log('--- TEST 3: Ephemeral Presence, Colors, Cursors & Disconnect Cleanup ---');
    {
      const clientA = createCollabClient(docId, alice.rawToken);
      const clientB = createCollabClient(docId, bob.rawToken);

      await waitFor(() => clientA.isSynced && clientB.isSynced);

      // Client A broadcasts cursor position and custom color
      clientA.provider.awareness.setLocalState({
        user: { name: 'Alice Owner', color: '#4F46E5', email: 'alice@collabspace.dev' },
        cursor: { anchor: 14, head: 14 },
      });

      // Verify Client B receives Client A's presence
      await waitFor(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const states = Array.from(clientB.provider.awareness.getStates().values()) as any[];
        return states.some((s) => s?.user?.name === 'Alice Owner' && s?.cursor?.anchor === 14);
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const aliceStateInB = (Array.from(clientB.provider.awareness.getStates().values()) as any[]).find(
        (s) => s?.user?.name === 'Alice Owner'
      );

      assert(aliceStateInB?.user?.color === '#4F46E5', 'Client B receives unique collaborator color');
      assert(aliceStateInB?.cursor?.head === 14, 'Client B receives real-time remote cursor position');

      // Verify ephemeral awareness is NOT stored in document content
      const docState = clientA.ydoc.getText('content').toString();
      assert(!docState.includes('#4F46E5') && !docState.includes('anchor'), 'Ephemeral presence is never persisted to document content');

      // Verify presence cleanup upon disconnect
      clientA.provider.destroy();

      await waitFor(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const states = Array.from(clientB.provider.awareness.getStates().values()) as any[];
        return !states.some((s) => s?.user?.name === 'Alice Owner');
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const peerCountAfterDisconnect = (Array.from(clientB.provider.awareness.getStates().values()) as any[]).filter(
        (s) => s?.user?.name === 'Alice Owner'
      ).length;

      assert(peerCountAfterDisconnect === 0, 'Disconnected collaborator presence is cleanly purged from peer awareness');
      clientB.provider.destroy();
    }
    console.log();

    // -----------------------------------------------------------------
    // TEST 4: Collaborative Undo / Redo Isolation
    // -----------------------------------------------------------------
    console.log('--- TEST 4: Collaborative Undo/Redo Isolation ---');
    {
      const clientA = createCollabClient(docId, alice.rawToken);
      const clientB = createCollabClient(docId, bob.rawToken);

      await waitFor(() => clientA.isSynced && clientB.isSynced);

      const textA = clientA.ydoc.getText('undo-test');
      const textB = clientB.ydoc.getText('undo-test');

      // Create local UndoManager for Client A tracking origin 'clientA'
      const undoManagerA = new Y.UndoManager(textA, {
        trackedOrigins: new Set(['clientA']),
      });

      // Client A types "A1 "
      clientA.ydoc.transact(() => {
        textA.insert(textA.length, 'A1 ');
      }, 'clientA');

      // Client B types "B1 "
      clientB.ydoc.transact(() => {
        textB.insert(textB.length, 'B1 ');
      }, 'clientB');

      await waitFor(() => textA.toString() === textB.toString() && textA.toString().includes('B1 '));

      // Client A calls undo: it must revert A1 without reverting Bob's B1!
      undoManagerA.undo();

      await waitFor(() => textA.toString() === textB.toString() && !textA.toString().includes('A1 '));

      assert(textA.toString().includes('B1 '), 'Client A undo does NOT affect Client B concurrent text');
      assert(!textA.toString().includes('A1 '), 'Client A undo cleanly reverts local change');

      clientA.provider.destroy();
      clientB.provider.destroy();
    }
    console.log();

    // -----------------------------------------------------------------
    // TEST 5: Wire-Level Security & Read-Only Viewer Mutation Blocking
    // -----------------------------------------------------------------
    console.log('--- TEST 5: Viewer Read-Only Wire-Level Security ---');
    {
      const charlieClient = createCollabClient(docId, charlie.rawToken);
      await waitFor(() => charlieClient.isSynced);
      assert(charlieClient.provider.wsconnected, 'Viewer Charlie can connect to view the document');

      let authDeniedReason: string | null = null;
      charlieClient.provider.ws?.addEventListener('message', (event) => {
        try {
          const uint8 = new Uint8Array(event.data as ArrayBuffer);
          const decoder = decoding.createDecoder(uint8);
          const msgType = decoding.readVarUint(decoder);
          if (msgType === messageAuth) {
            authProtocol.readAuthMessage(decoder, charlieClient.ydoc, (_y, reason) => {
              authDeniedReason = reason;
            });
          }
        } catch {}
      });

      // Craft an unauthorized edit update directly on a local doc
      const rogueDoc = new Y.Doc();
      const rogueText = rogueDoc.getText('content');
      rogueText.insert(0, 'HACKED BY VIEWER! ');
      const rogueUpdate = Y.encodeStateAsUpdate(rogueDoc);

      // Attempt to transmit raw mutation payload over WebSocket
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeUpdate(encoder, rogueUpdate);
      charlieClient.provider.ws?.send(encoding.toUint8Array(encoder));

      // Verify the server rejects the write mutation
      await waitFor(() => authDeniedReason !== null);

      assert(
        authDeniedReason !== null && (authDeniedReason as string).includes('read-only'),
        'Server blocks edit mutation from viewer and sends writePermissionDenied'
      );

      // Connect Alice to verify document is uncorrupted
      const aliceClient = createCollabClient(docId, alice.rawToken);
      await waitFor(() => aliceClient.isSynced);

      const content = aliceClient.ydoc.getText('content').toString();
      assert(!content.includes('HACKED'), 'Unauthorized viewer mutation was blocked at wire protocol level');

      charlieClient.provider.destroy();
      aliceClient.provider.destroy();
    }
    console.log();

    // -----------------------------------------------------------------
    // TEST 6: PostgreSQL Persistence & Cold Server Restart Durability
    // -----------------------------------------------------------------
    console.log('--- TEST 6: PostgreSQL Persistence & Server Restart Durability ---');
    {
      const client = createCollabClient(docId, alice.rawToken);
      await waitFor(() => client.isSynced);

      const uniqueMarker = `DURABILITY_CHECK_${Date.now()}`;
      client.ydoc.getText('durability').insert(0, uniqueMarker);

      // Wait a moment for server to receive and process update
      await new Promise((r) => setTimeout(r, 300));

      // Disconnect and let server flush persistence to PostgreSQL
      client.provider.destroy();
      await new Promise((r) => setTimeout(r, 1500)); // allow debounce flush

      // Verify PostgreSQL Document record has yjsState stored
      const savedDoc = await prisma.document.findUnique({
        where: { id: docId },
        select: { yjsState: true },
      });

      assert(savedDoc?.yjsState !== null && savedDoc!.yjsState!.length > 0, 'Yjs binary state is durably saved to PostgreSQL Document.yjsState');

      // Simulate cold server restart:
      console.log('  [Action] Restarting WebSocket collaboration service (simulating crash / cold boot)...');
      docs.clear(); // Clear in-memory rooms
      await collabServer.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));

      // Spin up brand new server instance
      httpServer = http.createServer();
      collabServer = createCollabServer(httpServer);
      await new Promise<void>((resolve) => httpServer.listen(TEST_PORT, resolve));

      // Client B connects to restarted server
      const clientB = createCollabClient(docId, bob.rawToken);
      console.log('  [Debug] Client B created, waiting for sync and data...');
      await waitFor(() => clientB.isSynced, 4000);
      console.log('  [Debug] Client B isSynced =', clientB.isSynced, 'wsconnected =', clientB.provider.wsconnected);

      const success = await waitFor(
        () => {
          const t = clientB.ydoc.getText('durability').toString();
          return t.includes(uniqueMarker);
        },
        5000
      );
      const restoredText = clientB.ydoc.getText('durability').toString();
      console.log('  [Debug] Client B restoredText:', JSON.stringify(restoredText), 'expected to include:', uniqueMarker);

      assert(success && restoredText.includes(uniqueMarker), 'Document state safely rehydrates from PostgreSQL on room restart without lost updates');
      clientB.provider.destroy();
    }
    console.log();

    // -----------------------------------------------------------------
    // TEST 7: Reconnection & Offline Reconciliation
    // -----------------------------------------------------------------
    console.log('--- TEST 7: Reconnection & Offline Change Reconciliation ---');
    {
      const clientOffline = createCollabClient(docId, alice.rawToken);
      await waitFor(() => clientOffline.isSynced);

      // Alice goes offline
      clientOffline.provider.disconnect();

      // Alice makes local changes while disconnected
      clientOffline.ydoc.getText('offline-test').insert(0, 'Offline Alice Edits | ');

      // Bob connects and makes concurrent online changes
      const clientOnline = createCollabClient(docId, bob.rawToken);
      await waitFor(() => clientOnline.isSynced);
      clientOnline.ydoc.getText('offline-test').insert(0, 'Online Bob Edits | ');

      // Wait for server to receive Bob's edits
      await new Promise((r) => setTimeout(r, 300));

      // Alice comes back online
      clientOffline.provider.connect();

      // Verify reconciliation
      await waitFor(() => {
        const textA = clientOffline.ydoc.getText('offline-test').toString();
        const textB = clientOnline.ydoc.getText('offline-test').toString();
        return textA === textB && textA.includes('Offline Alice') && textA.includes('Online Bob');
      }, 5000);

      const finalReconciledText = clientOffline.ydoc.getText('offline-test').toString();
      assert(
        finalReconciledText.includes('Offline Alice') && finalReconciledText.includes('Online Bob'),
        'Offline changes reconcile deterministically with concurrent server edits upon reconnection'
      );

      clientOffline.provider.destroy();
      clientOnline.provider.destroy();
    }
    console.log();

  } finally {
    // Teardown
    console.log('--- Teardown: Stopping test server & cleaning up database fixtures ---');
    await collabServer.close().catch(() => {});
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));

    // Clean up test documents and users
    await prisma.document.deleteMany({ where: { workspaceId: workspace.id } }).catch(() => {});
    await prisma.workspaceMember.deleteMany({ where: { workspaceId: workspace.id } }).catch(() => {});
    await prisma.workspace.delete({ where: { id: workspace.id } }).catch(() => {});
    await prisma.session.deleteMany({
      where: {
        userId: { in: [alice.user.id, bob.user.id, charlie.user.id, eve.user.id] },
      },
    }).catch(() => {});
    await prisma.$disconnect().catch(() => {});
  }

  console.log('\n===============================================================');
  console.log(`COLLABORATION TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runCollaborationSuite().catch(async (err) => {
  console.error('Test suite uncaught error:', err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
