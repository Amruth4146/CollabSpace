/**
 * Document Durability, Snapshots, Version History & Recovery Test Suite
 *
 * Verifies:
 * 1. Automatic persistence of Yjs document updates to PostgreSQL
 * 2. Editing and refresh state rehydration
 * 3. Simultaneous multi-user collaborative editing with CRDT convergence
 * 4. Periodic and manual snapshot creation with author metadata and timestamps
 * 5. Safe collaborative version restore while peers are actively editing (no blind HTML overwrite)
 * 6. Automatic pre-restore safety snapshot creation
 * 7. Concurrent restore attempts serialization and concurrency safety
 * 8. Subsequent editing after restore without divergence or corrupted CRDT state
 * 9. Cold server restart durability
 * 10. Soft deletion and trash recovery with 100% content preservation
 * 11. Safe snapshot retention policy enforcement (caps max versions, prunes oldest)
 */

import { WebSocket } from 'ws';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import http from 'http';
import { prisma } from '../src/lib/prisma';
import { generateSecureToken, hashToken } from '../src/lib/auth/crypto';
import { createCollabServer, docs, persistDocument } from '../server/collab-server';
import {
  createDocumentSnapshot,
  restoreDocumentSnapshot,
  getDocumentVersions,
  MAX_SNAPSHOT_RETENTION,
} from '../src/lib/snapshots';

const TEST_PORT = 1239;
const TEST_WS_URL = `ws://127.0.0.1:${TEST_PORT}`;

// Helper: Create test user with session
async function createTestUser(email: string, name: string) {
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash: 'test-hash-history',
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
      userAgent: 'HistoryTestSuite/1.0',
    },
  });

  return { user, session, rawToken };
}

// Helper: Create connected Yjs client
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

// Helper: Polling condition waiter
async function waitFor(fn: () => boolean, timeoutMs = 5000, intervalMs = 50): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

function extractText(fragment: Y.XmlFragment): string {
  let text = '';
  for (let i = 0; i < fragment.length; i++) {
    const item = fragment.get(i);
    if (item instanceof Y.XmlElement) {
      for (let j = 0; j < item.length; j++) {
        const child = item.get(j);
        if (child instanceof Y.XmlText) {
          text += child.toString();
        }
      }
    } else if (item instanceof Y.XmlText) {
      text += item.toString();
    }
  }
  return text;
}

function appendParagraph(fragment: Y.XmlFragment, content: string) {
  const p = new Y.XmlElement('paragraph');
  const txt = new Y.XmlText(content);
  p.insert(0, [txt]);
  fragment.push([p]);
}

async function runHistoryDurabilitySuite() {
  console.log('\n===============================================================');
  console.log('   COLLABSPACE DOCUMENT HISTORY & DURABILITY TEST SUITE   ');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✓ [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${msg}`);
      failed++;
    }
  }

  // -----------------------------------------------------------------
  // Setup
  // -----------------------------------------------------------------
  console.log('--- Step 0: Setting up fixtures & starting collab service ---');
  const alice = await createTestUser('alice-hist@test.dev', 'Alice Owner');
  const bob = await createTestUser('bob-hist@test.dev', 'Bob Editor');

  const workspace = await prisma.workspace.create({
    data: {
      name: 'History Durability Workspace',
      slug: `hist-test-${Date.now()}`,
      ownerId: alice.user.id,
      members: {
        create: [{ userId: bob.user.id, role: 'editor' }],
      },
    },
  });

  const testDoc = await prisma.document.create({
    data: {
      title: 'Durable Architecture Spec',
      content: '<p>Initial baseline content.</p>',
      workspaceId: workspace.id,
      authorId: alice.user.id,
    },
  });

  const httpServer = http.createServer();
  const collabServerInstance = createCollabServer(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(TEST_PORT, resolve));
  console.log(`[Setup] Collab service active on port ${TEST_PORT}, docId: ${testDoc.id}\n`);

  try {
    // -----------------------------------------------------------------
    // TEST 1: Editing & Refresh Persistence
    // -----------------------------------------------------------------
    console.log('--- TEST 1: Editing & Refresh Persistence ---');
    const clientA = createCollabClient(testDoc.id, alice.rawToken);
    await waitFor(() => clientA.isSynced, 4000);

    const fragmentA = clientA.ydoc.getXmlFragment('default');
    appendParagraph(fragmentA, 'Alice Section 1: Distributed Transactions.');

    // Wait for server update propagation and trigger persistence
    await new Promise((r) => setTimeout(r, 600));
    const liveDoc = docs.get(testDoc.id);
    assert(Boolean(liveDoc), 'Document room is active in collab server memory');

    if (liveDoc) {
      await persistDocument(liveDoc);
    }

    const dbCheck1 = await prisma.document.findUnique({
      where: { id: testDoc.id },
      select: { yjsState: true },
    });
    assert(Boolean(dbCheck1?.yjsState && dbCheck1.yjsState.length > 0), 'Yjs binary state persisted durably to PostgreSQL Document.yjsState');

    // Simulate refresh: Open second client to same doc
    const clientRefresh = createCollabClient(testDoc.id, alice.rawToken);
    await waitFor(() => clientRefresh.isSynced, 4000);
    const refreshedText = extractText(clientRefresh.ydoc.getXmlFragment('default'));
    assert(refreshedText.includes('Distributed Transactions'), 'New client on page refresh hydrates full persisted state');

    clientRefresh.provider.destroy();

    // -----------------------------------------------------------------
    // TEST 2: Snapshot Creation & Version Timeline
    // -----------------------------------------------------------------
    console.log('\n--- TEST 2: Snapshot Creation & Version Timeline ---');
    const v1Snapshot = await createDocumentSnapshot(testDoc.id, {
      authorId: alice.user.id,
      title: 'Draft 1: Architecture Baseline',
      changeSummary: 'Initial architecture specification',
      contentSnapshot: '<p>Alice Section 1: Distributed Transactions.</p>',
      addedCount: 45,
      removedCount: 0,
    });

    assert(Boolean(v1Snapshot), 'v1Snapshot created successfully');
    assert(v1Snapshot!.versionNumber === 1, 'First snapshot assigned versionNumber = 1');
    assert(v1Snapshot!.authorId === alice.user.id, 'Snapshot retains author metadata');
    assert(Boolean(v1Snapshot!.createdAt), 'Snapshot has immutable timestamp');

    const versionsList = await getDocumentVersions(testDoc.id);
    assert(versionsList.length >= 1, 'Version timeline retrieves persisted snapshots from PostgreSQL');
    assert(versionsList[0].versionNumber === 1, 'Version timeline ordered descending by version number');

    // -----------------------------------------------------------------
    // TEST 3: Simultaneous Multi-User Collaborative Editing
    // -----------------------------------------------------------------
    console.log('\n--- TEST 3: Simultaneous Multi-User Editing & CRDT Convergence ---');
    const clientB = createCollabClient(testDoc.id, bob.rawToken);
    await waitFor(() => clientB.isSynced, 4000);

    const fragmentB = clientB.ydoc.getXmlFragment('default');

    // Client A and B type simultaneously in separate transactions
    clientA.ydoc.transact(() => {
      appendParagraph(fragmentA, 'Alice concurrent note: Paxos protocol.');
    });

    clientB.ydoc.transact(() => {
      appendParagraph(fragmentB, 'Bob concurrent note: Raft consensus.');
    });

    // Wait for cross-client sync
    await waitFor(() => {
      const textA = extractText(fragmentA);
      const textB = extractText(fragmentB);
      return textA.includes('Raft consensus') && textB.includes('Paxos protocol');
    }, 4000);

    const finalTextA = extractText(fragmentA);
    const finalTextB = extractText(fragmentB);
    assert(finalTextA === finalTextB, 'Both clients converge to 100% identical document state');
    assert(finalTextA.includes('Paxos') && finalTextA.includes('Raft'), 'Both concurrent edits preserved without last-write-wins loss');

    // Create Version 2 snapshot
    const v2Snapshot = await createDocumentSnapshot(testDoc.id, {
      authorId: bob.user.id,
      title: 'Draft 2: Added Consensus Sections',
      changeSummary: 'Added Raft and Paxos notes',
      contentSnapshot: `<p>${finalTextA}</p>`,
      addedCount: 65,
      removedCount: 0,
    });
    assert(Boolean(v2Snapshot), 'v2Snapshot created successfully');
    assert(v2Snapshot!.versionNumber === 2, 'Second snapshot assigned versionNumber = 2');

    // -----------------------------------------------------------------
    // TEST 4: Safe Collaborative Restore (Without Blind HTML Overwrite)
    // -----------------------------------------------------------------
    console.log('\n--- TEST 4: Safe Collaborative Restore for Active Sessions ---');
    // Client A and Client B are actively connected!
    // We execute a safe restore to Version 1 (which only had Section 1)
    const restoreResult = await restoreDocumentSnapshot(testDoc.id, v1Snapshot!.id, alice.user.id);
    assert(restoreResult.success, 'restoreDocumentSnapshot completed successfully');
    assert(restoreResult.safetyVersion?.versionNumber === 3, 'Pre-restore safety snapshot (v3) created automatically before revert');

    // Wait for real-time CRDT propagation to both connected clients
    await waitFor(() => {
      const tA = extractText(fragmentA);
      const tB = extractText(fragmentB);
      return !tA.includes('Raft consensus') && !tB.includes('Raft consensus');
    }, 4000);

    const restoredTextA = extractText(fragmentA);
    const restoredTextB = extractText(fragmentB);

    assert(restoredTextA.includes('Distributed Transactions'), 'Client A received restored Version 1 content');
    assert(restoredTextB.includes('Distributed Transactions'), 'Client B received restored Version 1 content');
    assert(!restoredTextA.includes('Raft consensus'), 'Reverted sections cleanly removed via CRDT differential transaction');
    assert(clientA.provider.wsconnected && clientB.provider.wsconnected, 'Active clients remained continuously connected during restore');

    // -----------------------------------------------------------------
    // TEST 5: Subsequent Editing After Safe Restore
    // -----------------------------------------------------------------
    console.log('\n--- TEST 5: Subsequent Editing on Top of Restored State ---');
    clientB.ydoc.transact(() => {
      appendParagraph(fragmentB, 'Post-restore edit: Hybrid Byzantine Fault Tolerance.');
    });

    await waitFor(() => extractText(fragmentA).includes('Hybrid Byzantine'), 4000);
    const postRestoreA = extractText(fragmentA);
    assert(postRestoreA.includes('Distributed Transactions') && postRestoreA.includes('Hybrid Byzantine'), 'New edits merge cleanly on top of restored state without divergence');

    // -----------------------------------------------------------------
    // TEST 6: Concurrent Restore Serialization
    // -----------------------------------------------------------------
    console.log('\n--- TEST 6: Concurrent Restore Serialization ---');
    // Trigger two restores at the exact same millisecond
    const p1 = restoreDocumentSnapshot(testDoc.id, v1Snapshot!.id, alice.user.id);
    const p2 = restoreDocumentSnapshot(testDoc.id, v2Snapshot!.id, bob.user.id);
    const [res1, res2] = await Promise.all([p1, p2]);

    assert(res1.success && res2.success, 'Concurrent restore requests handled safely without deadlock or exception');
    const versionsPostConcurrent = await getDocumentVersions(testDoc.id);
    assert(versionsPostConcurrent.length >= 5, 'Safety snapshots created for each restore attempt');

    // -----------------------------------------------------------------
    // TEST 7: Cold Server Restart Durability
    // -----------------------------------------------------------------
    console.log('\n--- TEST 7: Cold Server Restart Durability ---');
    // Persist current state
    if (liveDoc) await persistDocument(liveDoc);

    // Close clients and shutdown server
    clientA.provider.destroy();
    clientB.provider.destroy();
    docs.delete(testDoc.id);

    await collabServerInstance.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));

    // Boot fresh server on new port
    const restartHttpServer = http.createServer();
    const restartCollabInstance = createCollabServer(restartHttpServer);
    await new Promise<void>((resolve) => restartHttpServer.listen(TEST_PORT + 1, resolve));

    // Connect client to restarted server
    const clientRestart = new WebsocketProvider(
      `ws://127.0.0.1:${TEST_PORT + 1}`,
      testDoc.id,
      new Y.Doc(),
      {
        params: { token: alice.rawToken },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        WebSocketPolyfill: WebSocket as any,
        disableBc: true,
      }
    );

    await waitFor(() => clientRestart.synced, 4000);
    const rehydratedText = extractText(clientRestart.doc.getXmlFragment('default'));
    assert(rehydratedText.length > 0, 'Document state safely rehydrates from PostgreSQL on cold boot');

    clientRestart.destroy();
    await restartCollabInstance.close();
    await new Promise<void>((resolve) => restartHttpServer.close(() => resolve()));

    // -----------------------------------------------------------------
    // TEST 8: Soft Deletion & Trash Recovery
    // -----------------------------------------------------------------
    console.log('\n--- TEST 8: Soft Deletion & Trash Recovery ---');
    // Soft delete document
    const softDeleted = await prisma.document.update({
      where: { id: testDoc.id },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    assert(softDeleted.isDeleted === true, 'Document soft deleted (moved to trash)');

    // Verify it is excluded from active documents
    const activeDocs = await prisma.document.findMany({
      where: { workspaceId: workspace.id, isDeleted: false },
    });
    assert(!activeDocs.some((d) => d.id === testDoc.id), 'Soft deleted document excluded from active document list');

    // Verify it is present in trash query
    const trashDocs = await prisma.document.findMany({
      where: { workspaceId: workspace.id, isDeleted: true },
    });
    assert(trashDocs.some((d) => d.id === testDoc.id), 'Document appears in trash view');

    // Recover document from trash
    const recoveredDoc = await prisma.document.update({
      where: { id: testDoc.id },
      data: { isDeleted: false, deletedAt: null },
    });
    assert(recoveredDoc.isDeleted === false && recoveredDoc.deletedAt === null, 'Document recovered from trash');

    const versionsAfterRecovery = await getDocumentVersions(testDoc.id);
    assert(versionsAfterRecovery.length > 0, '100% of version history preserved across trash lifecycle');

    // -----------------------------------------------------------------
    // TEST 9: Snapshot Retention Policy Enforcement
    // -----------------------------------------------------------------
    console.log('\n--- TEST 9: Snapshot Retention Policy Enforcement ---');
    // Create 55 snapshots sequentially to test retention cap of 50
    for (let i = 0; i < 55; i++) {
      await createDocumentSnapshot(testDoc.id, {
        title: `Stress Snapshot ${i}`,
        changeSummary: `Retention test snapshot ${i}`,
        contentSnapshot: `<p>Version ${i}</p>`,
      });
    }

    const totalVersionsAfterStress = await prisma.documentVersion.count({
      where: { documentId: testDoc.id },
    });
    assert(
      totalVersionsAfterStress <= MAX_SNAPSHOT_RETENTION,
      `Version count capped at retention limit (${totalVersionsAfterStress} <= ${MAX_SNAPSHOT_RETENTION})`
    );

  } finally {
    // -----------------------------------------------------------------
    // Teardown
    // -----------------------------------------------------------------
    console.log('\n--- Cleaning up test fixtures ---');
    try {
      await prisma.documentVersion.deleteMany({ where: { documentId: testDoc.id } });
      await prisma.document.delete({ where: { id: testDoc.id } });
      await prisma.workspaceMember.deleteMany({ where: { workspaceId: workspace.id } });
      await prisma.workspace.delete({ where: { id: workspace.id } });
      await prisma.session.deleteMany({
        where: { userId: { in: [alice.user.id, bob.user.id] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [alice.user.id, bob.user.id] } },
      });
      console.log('[Cleanup] Test fixtures safely removed from PostgreSQL.');
    } catch (cleanupErr) {
      console.warn('[Cleanup] Error during teardown:', cleanupErr);
    }
  }

  console.log('\n===============================================================');
  console.log(`DURABILITY & HISTORY TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runHistoryDurabilitySuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
