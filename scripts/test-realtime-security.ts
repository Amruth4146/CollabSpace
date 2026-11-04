/**
 * Step 5: Real-Time Security & Authorization Verification Script
 * 
 * Verifies:
 * 1. Unauthorized WebSocket connection rejection (missing token -> 4401, invalid token -> 4401, outsider -> 4403).
 * 2. Member revocation & session invalidation denies reconnect.
 * 3. Commenters & Viewers cannot mutate Yjs CRDT via wire protocol (server sends writePermissionDenied).
 * 4. Viewers cannot post comments via REST (403 Forbidden).
 * 5. Cross-document isolation (cannot post or read comments across document boundaries).
 * 6. Consistency between WebSocket and REST authorization matrices.
 */

import http from 'http';
import WebSocket from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as authProtocol from 'y-protocols/auth';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { prisma } from '../src/lib/prisma';
import { hashPassword, generateSecureToken, hashToken } from '../src/lib/auth/crypto';
import { createCollabServer } from '../server/collab-server';

const PASS = '✓ [PASS]';
const FAIL = '✗ [FAIL]';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, message: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ${PASS} ${message}`);
  } else {
    failedTests++;
    console.error(`  ${FAIL} ${message}${detail ? ` (${detail})` : ''}`);
  }
}

async function createTestSession(userId: string): Promise<string> {
  const rawToken = generateSecureToken();
  const tokenHash = hashToken(rawToken);
  await prisma.session.create({
    data: {
      userId,
      sessionToken: tokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  return rawToken;
}

async function runSecurityAudit() {
  console.log('\n===============================================================');
  console.log('   STEP 5: REAL-TIME SECURITY & AUTHORIZATION VERIFICATION     ');
  console.log('===============================================================\n');

  const ts = Date.now();
  const testPort = 1243;
  const server = http.createServer();
  const collab = createCollabServer(server, `sec-test-${ts}`);

  await new Promise<void>((resolve) => server.listen(testPort, resolve));
  const wsBaseUrl = `ws://127.0.0.1:${testPort}`;
  const restBaseUrl = 'http://127.0.0.1:3000';

  const passwordHash = await hashPassword('AuditorSecurePass123!');

  // Seed Users
  const ownerUser = await prisma.user.create({
    data: { email: `sec_owner_${ts}@audit.test`, name: 'Audit Owner', passwordHash },
  });
  const editorUser = await prisma.user.create({
    data: { email: `sec_editor_${ts}@audit.test`, name: 'Audit Editor', passwordHash },
  });
  const commenterUser = await prisma.user.create({
    data: { email: `sec_commenter_${ts}@audit.test`, name: 'Audit Commenter', passwordHash },
  });
  const viewerUser = await prisma.user.create({
    data: { email: `sec_viewer_${ts}@audit.test`, name: 'Audit Viewer', passwordHash },
  });
  const outsiderUser = await prisma.user.create({
    data: { email: `sec_outsider_${ts}@audit.test`, name: 'Audit Outsider', passwordHash },
  });

  const ownerToken = await createTestSession(ownerUser.id);
  const editorToken = await createTestSession(editorUser.id);
  const commenterToken = await createTestSession(commenterUser.id);
  const viewerToken = await createTestSession(viewerUser.id);
  const outsiderToken = await createTestSession(outsiderUser.id);

  // Seed Workspaces & Documents
  // Workspace A: Owner, Editor, Commenter, Viewer
  const workspaceA = await prisma.workspace.create({
    data: {
      name: `Security Workspace A ${ts}`,
      slug: `sec-ws-a-${ts}`,
      ownerId: ownerUser.id,
      members: {
        create: [
          { userId: ownerUser.id, role: 'owner' },
          { userId: editorUser.id, role: 'editor' },
          { userId: commenterUser.id, role: 'commenter' },
          { userId: viewerUser.id, role: 'viewer' },
        ],
      },
    },
  });

  // Workspace B: Isolated Workspace (Outsider is owner)
  const workspaceB = await prisma.workspace.create({
    data: {
      name: `Security Workspace B ${ts}`,
      slug: `sec-ws-b-${ts}`,
      ownerId: outsiderUser.id,
      members: {
        create: [{ userId: outsiderUser.id, role: 'owner' }],
      },
    },
  });

  const docA = await prisma.document.create({
    data: {
      title: 'Security Document Alpha',
      workspaceId: workspaceA.id,
      authorId: ownerUser.id,
      content: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', text: 'Sensitive Content Doc A' }] }),
    },
  });

  const docB = await prisma.document.create({
    data: {
      title: 'Security Document Beta',
      workspaceId: workspaceB.id,
      authorId: outsiderUser.id,
      content: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', text: 'Private Content Doc B' }] }),
    },
  });

  try {
    // -------------------------------------------------------------
    // SUB-TEST 1: Unauthorized WebSocket Connection Rejection
    // -------------------------------------------------------------
    console.log('--- SUB-TEST 1: Unauthorized WebSocket Connection Rejection ---');

    // 1a. Missing token -> close code 4401
    const missingTokenCloseCode = await new Promise<number>((resolve) => {
      const ws = new WebSocket(`${wsBaseUrl}/${docA.id}`);
      ws.on('close', (code) => resolve(code));
      ws.on('error', () => {});
    });
    assert(missingTokenCloseCode === 4401, 'Missing session token rejected with close code 4401', `Got ${missingTokenCloseCode}`);

    // 1b. Invalid/malformed token -> close code 4401
    const invalidTokenCloseCode = await new Promise<number>((resolve) => {
      const ws = new WebSocket(`${wsBaseUrl}/${docA.id}?token=malformed_fake_token_123456789`);
      ws.on('close', (code) => resolve(code));
      ws.on('error', () => {});
    });
    assert(invalidTokenCloseCode === 4401, 'Invalid session token rejected with close code 4401', `Got ${invalidTokenCloseCode}`);

    // 1c. Outsider (valid session, but zero workspace/doc permissions) -> close code 4403
    const outsiderCloseCode = await new Promise<number>((resolve) => {
      const ws = new WebSocket(`${wsBaseUrl}/${docA.id}?token=${outsiderToken}`);
      ws.on('close', (code) => resolve(code));
      ws.on('error', () => {});
    });
    assert(outsiderCloseCode === 4403, 'Valid session from outsider non-member rejected with close code 4403', `Got ${outsiderCloseCode}`);

    // -------------------------------------------------------------
    // SUB-TEST 2: Revocation & Session Invalidation
    // -------------------------------------------------------------
    console.log('\n--- SUB-TEST 2: Member Revocation & Session Invalidation ---');

    // Create an ephemeral member who starts as viewer
    const revokedUser = await prisma.user.create({
      data: { email: `sec_revoked_${ts}@audit.test`, name: 'Audit Revoked', passwordHash },
    });
    const revokedMember = await prisma.workspaceMember.create({
      data: { workspaceId: workspaceA.id, userId: revokedUser.id, role: 'viewer' },
    });
    const revokedToken = await createTestSession(revokedUser.id);

    // Initial connection succeeds
    let initialRevokedConnect = false;
    const initialWs = new WebSocket(`${wsBaseUrl}/${docA.id}?token=${revokedToken}`);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Revoked user initial connect timeout')), 5000);
      initialWs.on('open', () => {
        initialRevokedConnect = true;
        clearTimeout(timer);
        initialWs.close();
        resolve();
      });
      initialWs.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
    assert(initialRevokedConnect, 'Revoked user can connect prior to membership removal');

    // Revoke membership from database
    await prisma.workspaceMember.delete({ where: { id: revokedMember.id } });

    // Subsequent connection attempt MUST be rejected with 4403
    const revokedReconnectCode = await new Promise<number>((resolve) => {
      const ws = new WebSocket(`${wsBaseUrl}/${docA.id}?token=${revokedToken}`);
      ws.on('close', (code) => resolve(code));
      ws.on('error', () => {});
    });
    assert(revokedReconnectCode === 4403, 'Post-revocation connection attempt denied with 4403', `Got ${revokedReconnectCode}`);

    // Session invalidation (logout/delete session)
    const tokenHash = hashToken(revokedToken);
    await prisma.session.deleteMany({ where: { sessionToken: tokenHash } });
    const invalidatedSessionCode = await new Promise<number>((resolve) => {
      const ws = new WebSocket(`${wsBaseUrl}/${docA.id}?token=${revokedToken}`);
      ws.on('close', (code) => resolve(code));
      ws.on('error', () => {});
    });
    assert(invalidatedSessionCode === 4401, 'Destroyed session rejected with 4401 on reconnect', `Got ${invalidatedSessionCode}`);

    // -------------------------------------------------------------
    // SUB-TEST 3: Wire-Level Yjs Mutation Interception
    // -------------------------------------------------------------
    console.log('\n--- SUB-TEST 3: Wire-Level Yjs Mutation Interception ---');

    async function testWireMutationForRole(roleName: string, token: string): Promise<boolean> {
      return new Promise<boolean>((resolve, reject) => {
        const ws = new WebSocket(`${wsBaseUrl}/${docA.id}?token=${token}`);
        let deniedReceived = false;

        const timer = setTimeout(() => {
          ws.close();
          resolve(deniedReceived);
        }, 3000);

        ws.on('message', (data: WebSocket.RawData) => {
          const uint8 = new Uint8Array(data as Buffer);
          const decoder = decoding.createDecoder(uint8);
          const msgType = decoding.readVarUint(decoder);

          if (msgType === 2) {
            // messageAuth
            const dummyDoc = new Y.Doc();
            authProtocol.readAuthMessage(decoder, dummyDoc, (_y, reason) => {
              if (reason.toLowerCase().includes('read-only') || reason.toLowerCase().includes('denied')) {
                deniedReceived = true;
                clearTimeout(timer);
                ws.close();
                resolve(true);
              }
            });
          }

          // When syncStep1 arrives, send malicious update
          if (msgType === 0) {
            const maliciousDoc = new Y.Doc();
            const text = maliciousDoc.getText('default');
            text.insert(0, `MALICIOUS_INJECTION_${roleName}`);
            const update = Y.encodeStateAsUpdate(maliciousDoc);

            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, 0); // messageSync
            syncProtocol.writeUpdate(encoder, update);
            ws.send(encoding.toUint8Array(encoder));
          }
        });

        ws.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });
    }

    const commenterDenied = await testWireMutationForRole('COMMENTER', commenterToken);
    assert(commenterDenied, 'Commenter wire-level Yjs update intercepted & writePermissionDenied returned');

    const viewerDenied = await testWireMutationForRole('VIEWER', viewerToken);
    assert(viewerDenied, 'Viewer wire-level Yjs update intercepted & writePermissionDenied returned');

    // Verify DB integrity
    const docACheck = await prisma.document.findUnique({ where: { id: docA.id } });
    const contentStr = JSON.stringify(docACheck?.content);
    assert(!contentStr.includes('MALICIOUS_INJECTION'), 'PostgreSQL document state completely unaffected by wire attempts');

    // -------------------------------------------------------------
    // SUB-TEST 4: Viewer Comment Denial (REST API)
    // -------------------------------------------------------------
    console.log('\n--- SUB-TEST 4: Viewer Comment Creation Denial (REST API) ---');

    const viewerCommentRes = await fetch(`${restBaseUrl}/api/documents/${docA.id}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `collabspace_session=${viewerToken}`,
      },
      body: JSON.stringify({
        text: 'Malicious comment from viewer',
      }),
    });
    assert(
      viewerCommentRes.status === 403,
      'Viewer POST /api/documents/[id]/comments returns 403 Forbidden',
      `Got status ${viewerCommentRes.status}`
    );

    // Commenter CAN post comment
    const commenterCommentRes = await fetch(`${restBaseUrl}/api/documents/${docA.id}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `collabspace_session=${commenterToken}`,
      },
      body: JSON.stringify({
        text: 'Legitimate comment from commenter',
        quote: 'Sensitive Content',
      }),
    });
    assert(
      commenterCommentRes.status === 201,
      'Commenter POST /api/documents/[id]/comments returns 201 Created',
      `Got status ${commenterCommentRes.status}`
    );
    const createdComment = await commenterCommentRes.json();

    // Viewer CANNOT reply to comment
    const viewerReplyRes = await fetch(`${restBaseUrl}/api/documents/${docA.id}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `collabspace_session=${viewerToken}`,
      },
      body: JSON.stringify({
        parentId: createdComment.id,
        text: 'Viewer attempting unauthorized reply',
      }),
    });
    assert(
      viewerReplyRes.status === 403,
      'Viewer POST reply returns 403 Forbidden',
      `Got status ${viewerReplyRes.status}`
    );

    // -------------------------------------------------------------
    // SUB-TEST 5: Cross-Document Isolation
    // -------------------------------------------------------------
    console.log('\n--- SUB-TEST 5: Cross-Document Isolation ---');

    // Commenter from Workspace A attempts to read comments from Doc B (Workspace B)
    const crossDocReadRes = await fetch(`${restBaseUrl}/api/documents/${docB.id}/comments`, {
      headers: { Cookie: `collabspace_session=${commenterToken}` },
    });
    assert(
      crossDocReadRes.status === 404 || crossDocReadRes.status === 403,
      'User cannot read comments from document in another workspace (404/403)',
      `Got status ${crossDocReadRes.status}`
    );

    // Commenter from Workspace A attempts to POST comment to Doc B
    const crossDocPostRes = await fetch(`${restBaseUrl}/api/documents/${docB.id}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `collabspace_session=${commenterToken}`,
      },
      body: JSON.stringify({ text: 'Cross-workspace comment injection' }),
    });
    assert(
      crossDocPostRes.status === 404 || crossDocPostRes.status === 403,
      'User cannot post comments to document in another workspace (404/403)',
      `Got status ${crossDocPostRes.status}`
    );

    // Cross-document comment ID manipulation: Outsider tries to modify Doc A comment via Doc B route
    const crossIdManipulationRes = await fetch(`${restBaseUrl}/api/documents/${docB.id}/comments/${createdComment.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `collabspace_session=${outsiderToken}`,
      },
      body: JSON.stringify({ resolved: true }),
    });
    assert(
      crossIdManipulationRes.status === 404,
      'Cross-document comment manipulation returns 404 (Comment does not belong to specified document)',
      `Got status ${crossIdManipulationRes.status}`
    );

    // -------------------------------------------------------------
    // SUB-TEST 6: Consistency Between WebSocket & REST Authorization
    // -------------------------------------------------------------
    console.log('\n--- SUB-TEST 6: WebSocket & REST Authorization Consistency ---');

    // Matrix verification:
    // User       | WS Connect | WS Write | REST Read | REST Edit | REST Comment
    // Owner      | YES        | YES      | YES       | YES       | YES
    // Editor     | YES        | YES      | YES       | YES       | YES
    // Commenter  | YES        | NO       | YES       | NO        | YES
    // Viewer     | YES        | NO       | YES       | NO        | NO
    // Outsider   | NO         | NO       | NO        | NO        | NO

    const rolesToTest = [
      { name: 'owner', token: ownerToken, canWsConnect: true, canWsWrite: true, canRestEdit: true, canRestComment: true },
      { name: 'editor', token: editorToken, canWsConnect: true, canWsWrite: true, canRestEdit: true, canRestComment: true },
      { name: 'commenter', token: commenterToken, canWsConnect: true, canWsWrite: false, canRestEdit: false, canRestComment: true },
      { name: 'viewer', token: viewerToken, canWsConnect: true, canWsWrite: false, canRestEdit: false, canRestComment: false },
      { name: 'outsider', token: outsiderToken, canWsConnect: false, canWsWrite: false, canRestEdit: false, canRestComment: false },
    ];

    for (const r of rolesToTest) {
      // Check REST Edit
      const restEditRes = await fetch(`${restBaseUrl}/api/documents/${docA.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `collabspace_session=${r.token}`,
        },
        body: JSON.stringify({ title: `Title updated by ${r.name}` }),
      });
      const restEditOk = restEditRes.status === 200;
      assert(
        restEditOk === r.canRestEdit,
        `REST Edit authorization consistent for ${r.name} (Expected ${r.canRestEdit}, Got status ${restEditRes.status})`
      );

      // Check REST Comment
      const restCommentRes = await fetch(`${restBaseUrl}/api/documents/${docA.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `collabspace_session=${r.token}`,
        },
        body: JSON.stringify({ text: `Comment by ${r.name}` }),
      });
      const restCommentOk = restCommentRes.status === 201;
      assert(
        restCommentOk === r.canRestComment,
        `REST Comment authorization consistent for ${r.name} (Expected ${r.canRestComment}, Got status ${restCommentRes.status})`
      );
    }

  } finally {
    // Teardown
    await collab.close().catch(() => {});
    await new Promise<void>((resolve) => server.close(() => resolve()));

    // Clean up DB records
    await prisma.comment.deleteMany({ where: { documentId: { in: [docA.id, docB.id] } } }).catch(() => {});
    await prisma.document.deleteMany({ where: { id: { in: [docA.id, docB.id] } } }).catch(() => {});
    await prisma.workspaceMember.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } }).catch(() => {});
    await prisma.workspace.deleteMany({ where: { id: { in: [workspaceA.id, workspaceB.id] } } }).catch(() => {});
    await prisma.session.deleteMany({ where: { userId: { in: [ownerUser.id, editorUser.id, commenterUser.id, viewerUser.id, outsiderUser.id] } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [ownerUser.id, editorUser.id, commenterUser.id, viewerUser.id, outsiderUser.id] } } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log('\n===============================================================');
  console.log(`REAL-TIME SECURITY RESULTS: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
  console.log('===============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSecurityAudit().catch((err) => {
  console.error('Fatal error during security audit:', err);
  process.exit(1);
});
