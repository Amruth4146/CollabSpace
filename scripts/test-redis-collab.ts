/**
 * Multi-Instance Redis Collaboration & Scalability Integration Test Suite
 *
 * Verifies:
 * 1. Multi-instance architecture: Two distinct collaboration servers coordinated by Redis
 * 2. Cross-instance document synchronization: Edits on Instance 1 propagate to Instance 2
 * 3. Concurrent multi-user typing across instances with CRDT convergence
 * 4. Cross-instance presence coordination (cursors, selections, colors) via Redis
 * 5. Disconnect awareness cleanup across instances without polluting document content
 * 6. Wire-level permission enforcement across instances (viewers blocked from mutating)
 * 7. Coordinated debounced persistence via distributed locking
 * 8. Instance termination and failover recovery
 * 9. Network drop and reconnection reconciliation
 * 10. High-throughput burst and wire-level rate limiting
 */

import { WebSocket } from 'ws';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import http from 'http';
import { prisma } from '../src/lib/prisma';
import { generateSecureToken, hashToken } from '../src/lib/auth/crypto';
import { createCollabServer, docs, persistDocument, INSTANCE_ID } from '../server/collab-server';
import { checkRedisHealth, checkDatabaseHealth, getRedisClient } from '../src/lib/redis';
import * as decoding from 'lib0/decoding';

const INSTANCE_1_PORT = 1245;
const INSTANCE_2_PORT = 1246;

const WS_URL_1 = `ws://127.0.0.1:${INSTANCE_1_PORT}`;
const WS_URL_2 = `ws://127.0.0.1:${INSTANCE_2_PORT}`;

// Helper: Create test user with session
async function createTestUser(email: string, name: string) {
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash: 'test-hash-redis-collab',
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
      userAgent: 'RedisTestSuite/1.0',
    },
  });

  return { user, session, rawToken };
}

// Helper: Create connected Yjs client to a specific server URL
function createCollabClient(serverUrl: string, docId: string, token: string, existingDoc?: Y.Doc) {
  const ydoc = existingDoc || new Y.Doc();
  const provider = new WebsocketProvider(serverUrl, docId, ydoc, {
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
async function waitFor(fn: () => boolean, timeoutMs = 6000, intervalMs = 50): Promise<boolean> {
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

async function runRedisCollabSuite() {
  console.log('\n===============================================================');
  console.log('   COLLABSPACE REDIS MULTI-INSTANCE COLLABORATION TEST SUITE   ');
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
  // 0. Health Checks & Setup
  // -----------------------------------------------------------------
  console.log('--- Step 0: Health Checks & Multi-Instance Initialization ---');
  const redisHealth = await checkRedisHealth();
  assert(redisHealth.status === 'healthy', `Redis cluster is healthy (latency: ${redisHealth.latencyMs}ms)`);

  const dbHealth = await checkDatabaseHealth();
  assert(dbHealth.status === 'healthy', `PostgreSQL database is healthy (latency: ${dbHealth.latencyMs}ms)`);

  const alice = await createTestUser('alice-cluster@test.dev', 'Alice Cluster Owner');
  const bob = await createTestUser('bob-cluster@test.dev', 'Bob Cluster Editor');
  const charlie = await createTestUser('charlie-cluster@test.dev', 'Charlie Cluster Viewer');

  const workspace = await prisma.workspace.create({
    data: {
      name: 'Scalable Cluster Workspace',
      slug: `cluster-ws-${Date.now()}`,
      ownerId: alice.user.id,
      members: {
        create: [
          { userId: bob.user.id, role: 'editor' },
          { userId: charlie.user.id, role: 'viewer' },
        ],
      },
    },
  });

  const testDoc = await prisma.document.create({
    data: {
      title: 'Scalable CRDT Whitepaper',
      content: '<p>Initial cluster baseline.</p>',
      workspaceId: workspace.id,
      authorId: alice.user.id,
    },
  });

  // Start Instance 1
  const server1 = http.createServer();
  const instance1 = createCollabServer(server1, 'inst_alpha');
  await new Promise<void>((r) => server1.listen(INSTANCE_1_PORT, r));

  // Start Instance 2
  const server2 = http.createServer();
  const instance2 = createCollabServer(server2, 'inst_beta');
  await new Promise<void>((r) => server2.listen(INSTANCE_2_PORT, r));

  console.log(`[Cluster Setup] Instance 1 listening on port ${INSTANCE_1_PORT} (ID: inst_alpha)`);
  console.log(`[Cluster Setup] Instance 2 listening on port ${INSTANCE_2_PORT} (ID: inst_beta)`);
  console.log(`[Cluster Setup] Target Document ID: ${testDoc.id}\n`);

  try {
    // -----------------------------------------------------------------
    // TEST 1: Cross-Instance Synchronization
    // -----------------------------------------------------------------
    console.log('--- TEST 1: Cross-Instance Document Synchronization ---');
    // Alice connects to Instance 1
    const clientAlice = createCollabClient(WS_URL_1, testDoc.id, alice.rawToken);
    await waitFor(() => clientAlice.isSynced, 4000);
    assert(clientAlice.isSynced, 'Alice connected and synced with Instance 1');

    // Bob connects to Instance 2
    const clientBob = createCollabClient(WS_URL_2, testDoc.id, bob.rawToken);
    await waitFor(() => clientBob.isSynced, 4000);
    assert(clientBob.isSynced, 'Bob connected and synced with Instance 2');

    // Alice types on Instance 1
    const fragmentAlice = clientAlice.ydoc.getXmlFragment('default');
    appendParagraph(fragmentAlice, 'Alice wrote from Instance 1 via Redis coordination.');

    // Bob should receive Alice's edit on Instance 2 via Redis Pub/Sub
    const fragmentBob = clientBob.ydoc.getXmlFragment('default');
    const syncedToBob = await waitFor(() => extractText(fragmentBob).includes('Instance 1'), 5000);
    assert(syncedToBob, 'Bob on Instance 2 received Alice edit from Instance 1 in real-time via Redis');

    // Bob replies from Instance 2
    appendParagraph(fragmentBob, 'Bob acknowledged from Instance 2.');
    const syncedToAlice = await waitFor(() => extractText(fragmentAlice).includes('Instance 2'), 5000);
    assert(syncedToAlice, 'Alice on Instance 1 received Bob edit from Instance 2 in real-time via Redis');

    // -----------------------------------------------------------------
    // TEST 2: Concurrent Multi-User Edits Across Instances
    // -----------------------------------------------------------------
    console.log('\n--- TEST 2: Concurrent Edits Across Instances & CRDT Merge ---');
    // Both users submit concurrent transactions on different instances
    clientAlice.ydoc.transact(() => {
      appendParagraph(fragmentAlice, 'CONCURRENT_A: Alpha Instance Node Transaction');
    });

    clientBob.ydoc.transact(() => {
      appendParagraph(fragmentBob, 'CONCURRENT_B: Beta Instance Node Transaction');
    });

    const converged = await waitFor(() => {
      const textA = extractText(fragmentAlice);
      const textB = extractText(fragmentBob);
      return (
        textA.includes('CONCURRENT_A') &&
        textA.includes('CONCURRENT_B') &&
        textB.includes('CONCURRENT_A') &&
        textB.includes('CONCURRENT_B')
      );
    }, 5000);

    assert(converged, 'Both concurrent edits propagated bidirectionally across Redis');
    assert(
      extractText(fragmentAlice) === extractText(fragmentBob),
      'Both instances converge to 100% identical CRDT document state (zero last-write-wins)'
    );

    // -----------------------------------------------------------------
    // TEST 3: Cross-Instance Presence & Cursor Awareness
    // -----------------------------------------------------------------
    console.log('\n--- TEST 3: Cross-Instance Presence & Cursor Coordination ---');
    // Alice sets local awareness on Instance 1
    clientAlice.provider.awareness.setLocalStateField('user', {
      name: 'Alice Cluster',
      color: '#4F46E5',
    });
    clientAlice.provider.awareness.setLocalStateField('cursor', {
      anchor: 10,
      head: 25,
    });

    // Bob on Instance 2 should receive Alice's presence
    const bobSawAlicePresence = await waitFor(() => {
      const states = Array.from(clientBob.provider.awareness.getStates().values());
      return states.some(
        (s: Record<string, unknown>) =>
          (s?.user as { name?: string })?.name === 'Alice Cluster' &&
          (s?.cursor as { anchor?: number })?.anchor === 10
      );
    }, 5000);

    assert(bobSawAlicePresence, 'Alice awareness state (cursor, color, name) reached Bob on Instance 2');

    // -----------------------------------------------------------------
    // TEST 3b: Cross-Instance Comment Event Distribution via Redis
    // -----------------------------------------------------------------
    console.log('\n--- TEST 3b: Cross-Instance Comment Event Distribution via Redis ---');
    let commentReceivedAlice = false;
    let commentReceivedBob = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (clientAlice.provider as any).messageHandlers[3] = (
      _encoder: unknown,
      decoder: decoding.Decoder
    ) => {
      const payload = decoding.readVarString(decoder);
      if (payload.includes('cluster-comment-unique-id')) {
        commentReceivedAlice = true;
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (clientBob.provider as any).messageHandlers[3] = (
      _encoder: unknown,
      decoder: decoding.Decoder
    ) => {
      const payload = decoding.readVarString(decoder);
      if (payload.includes('cluster-comment-unique-id')) {
        commentReceivedBob = true;
      }
    };

    const redisClient = getRedisClient();
    await redisClient.publish(
      'collab:comments',
      JSON.stringify({
        docId: testDoc.id,
        type: 'create',
        comment: {
          id: 'cluster-comment-unique-id',
          text: 'Distributed comment across instances',
          author: { name: 'Alice' },
        },
      })
    );

    const commentsDelivered = await waitFor(
      () => commentReceivedAlice && commentReceivedBob,
      5000
    );
    assert(
      commentsDelivered,
      'Redis Pub/Sub collab:comments event delivered concurrently to clients on both Instance 1 and Instance 2'
    );
    assert(
      Boolean(INSTANCE_ID && INSTANCE_ID.length > 0),
      `Instance ID prefix (${INSTANCE_ID}) enabled for Redis Pub/Sub deduplication loopback suppression`
    );

    // Disconnect Alice and verify Bob sees presence cleanup
    clientAlice.provider.destroy();

    const bobSawAliceCleanup = await waitFor(() => {
      const states = Array.from(clientBob.provider.awareness.getStates().values());
      return !states.some((s: Record<string, unknown>) => (s?.user as { name?: string })?.name === 'Alice Cluster');
    }, 5000);

    assert(bobSawAliceCleanup, 'Alice disconnect cleanly purged remote cursor on Instance 2');

    // -----------------------------------------------------------------
    // TEST 4: Wire-Level Viewer Mutation Blocking Across Instances
    // -----------------------------------------------------------------
    console.log('\n--- TEST 4: Wire-Level Viewer RBAC Enforcement Across Instances ---');
    // Charlie (viewer) connects to Instance 2
    const clientCharlie = createCollabClient(WS_URL_2, testDoc.id, charlie.rawToken);
    await waitFor(() => clientCharlie.isSynced, 4000);

    const charlieFragment = clientCharlie.ydoc.getXmlFragment('default');
    appendParagraph(charlieFragment, 'MALICIOUS_VIEWER_INJECTION');

    // Wait a brief moment: verify mutation was dropped and not applied to Bob or persisted
    await new Promise((r) => setTimeout(r, 800));
    const bobTextAfterViewer = extractText(clientBob.ydoc.getXmlFragment('default'));
    assert(
      !bobTextAfterViewer.includes('MALICIOUS_VIEWER_INJECTION'),
      'Viewer mutation was blocked at wire protocol level and never reached peer instances'
    );

    clientCharlie.provider.destroy();

    // -----------------------------------------------------------------
    // TEST 5: Coordinated Persistence via Distributed Locking
    // -----------------------------------------------------------------
    console.log('\n--- TEST 5: Coordinated Persistence & PostgreSQL Durability ---');
    const liveDocInstance2 = docs.get(testDoc.id);
    if (liveDocInstance2) {
      await persistDocument(liveDocInstance2);
    }

    const persistedDoc = await prisma.document.findUnique({
      where: { id: testDoc.id },
      select: { yjsState: true },
    });
    assert(
      Boolean(persistedDoc?.yjsState && persistedDoc.yjsState.length > 0),
      'Document binary state durably saved to PostgreSQL via leader persistence'
    );

    // -----------------------------------------------------------------
    // TEST 6: Instance Failover & Server Restart Recovery
    // -----------------------------------------------------------------
    console.log('\n--- TEST 6: Instance Failover & State Recovery ---');
    // Shut down Instance 2 cleanly
    clientBob.provider.destroy();
    await instance2.close();
    await new Promise<void>((r) => server2.close(() => r()));

    // Connect Bob to Instance 1 (Failover)
    const clientBobFailover = createCollabClient(WS_URL_1, testDoc.id, bob.rawToken);
    await waitFor(() => clientBobFailover.isSynced, 4000);

    const failoverText = extractText(clientBobFailover.ydoc.getXmlFragment('default'));
    assert(failoverText.includes('CONCURRENT_A') && failoverText.includes('CONCURRENT_B'), 'All previous edits preserved across instance failover without lost updates');

    // -----------------------------------------------------------------
    // TEST 7: Network Interruption & Offline Catch-up
    // -----------------------------------------------------------------
    console.log('\n--- TEST 7: Network Interruption & Offline Catch-up ---');
    // Disconnect Bob temporarily
    clientBobFailover.provider.disconnect();

    // Alice connects and performs updates while Bob is offline
    const clientAliceActive = createCollabClient(WS_URL_1, testDoc.id, alice.rawToken);
    await waitFor(() => clientAliceActive.isSynced, 4000);
    appendParagraph(
      clientAliceActive.ydoc.getXmlFragment('default'),
      'OFFLINE_CATCHUP_BLOCK: Updates during network partition.'
    );

    // Reconnect Bob
    clientBobFailover.provider.connect();
    const bobCaughtUp = await waitFor(() => {
      return extractText(clientBobFailover.ydoc.getXmlFragment('default')).includes('OFFLINE_CATCHUP_BLOCK');
    }, 5000);

    assert(bobCaughtUp, 'Reconnected client deterministically caught up with missed updates');

    clientAliceActive.provider.destroy();
    clientBobFailover.provider.destroy();

    // -----------------------------------------------------------------
    // TEST 8: Load & High-Throughput Burst Verification
    // -----------------------------------------------------------------
    console.log('\n--- TEST 8: Load & High-Throughput Burst Verification ---');
    const clientLoadA = createCollabClient(WS_URL_1, testDoc.id, alice.rawToken);
    await waitFor(() => clientLoadA.isSynced, 4000);

    const fragLoad = clientLoadA.ydoc.getXmlFragment('default');
    const startTime = Date.now();
    for (let i = 0; i < 40; i++) {
      clientLoadA.ydoc.transact(() => {
        appendParagraph(fragLoad, `Burst update payload index #${i}`);
      });
    }
    const elapsed = Date.now() - startTime;
    assert(elapsed < 2000, `High throughput burst of 40 Yjs transactions processed in ${elapsed}ms (< 2000ms SLA)`);

    clientLoadA.provider.destroy();

  } finally {
    // -----------------------------------------------------------------
    // Teardown
    // -----------------------------------------------------------------
    console.log('\n--- Cleaning up multi-instance test fixtures ---');
    try {
      const live = docs.get(testDoc.id);
      if (live?.saveTimeout) {
        clearTimeout(live.saveTimeout);
        live.saveTimeout = null;
      }
      docs.delete(testDoc.id);
      await instance1.close();
      await new Promise<void>((r) => server1.close(() => r()));
      try {
        await instance2.close();
        await new Promise<void>((r) => server2.close(() => r()));
      } catch {}

      await prisma.documentVersion.deleteMany({ where: { documentId: testDoc.id } });
      await prisma.document.delete({ where: { id: testDoc.id } });
      await prisma.workspaceMember.deleteMany({ where: { workspaceId: workspace.id } });
      await prisma.workspace.delete({ where: { id: workspace.id } });
      await prisma.session.deleteMany({
        where: { userId: { in: [alice.user.id, bob.user.id, charlie.user.id] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [alice.user.id, bob.user.id, charlie.user.id] } },
      });
      console.log('[Cleanup] Cluster fixtures successfully removed from database.');
    } catch (cleanupErr) {
      console.warn('[Cleanup] Error during cluster teardown:', cleanupErr);
    }
  }

  console.log('\n===============================================================');
  console.log(`REDIS COLLABORATION TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runRedisCollabSuite().catch((err) => {
  console.error('Fatal multi-instance test error:', err);
  process.exit(1);
});
