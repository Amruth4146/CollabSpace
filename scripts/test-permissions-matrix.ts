/**
 * CollabSpace Comprehensive RBAC Permission Matrix & WebSocket Security Test Suite
 * 
 * Tests the complete permission matrix across all 5 roles:
 * - owner
 * - admin
 * - editor
 * - commenter
 * - viewer
 * 
 * Verifies API authorization, privilege escalation defense, and wire-level WebSocket mutation protection.
 */

import { prisma } from '../src/lib/prisma';
import { hashPassword, generateSecureToken, hashToken } from '../src/lib/auth/crypto';
import {
  ROLE_HIERARCHY,
  getPermissionsForRole,
  verifyDocumentAccess,
  AuthError,
} from '../src/lib/auth/authorization';
import WebSocket from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as authProtocol from 'y-protocols/auth';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { createCollabServer } from '../server/collab-server';
import http from 'http';

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

async function runPermissionsMatrixTest() {
  console.log('\n===============================================================');
  console.log('   COLLABSPACE COMPLETE RBAC & COMMENTER SECURITY TEST SUITE   ');
  console.log('===============================================================\n');

  const ts = Date.now();
  const passwordHash = await hashPassword('SafeTestPass123!');

  // Create standalone HTTP + Collab Server on port 1242 for isolated WebSocket tests
  const server = http.createServer();
  const collab = createCollabServer(server, `perm-test-${ts}`);
  await new Promise<void>((resolve) => server.listen(1242, resolve));

  try {
    // -------------------------------------------------------------
    // TEST 1: Role Hierarchy & Capability Matrix Unit Assertions
    // -------------------------------------------------------------
    console.log('--- TEST 1: Role Hierarchy & Capability Matrix Definition ---');

    assert(ROLE_HIERARCHY.owner === 5, 'Owner has rank 5');
    assert(ROLE_HIERARCHY.admin === 4, 'Admin has rank 4');
    assert(ROLE_HIERARCHY.editor === 3, 'Editor has rank 3');
    assert(ROLE_HIERARCHY.commenter === 2, 'Commenter has rank 2');
    assert(ROLE_HIERARCHY.viewer === 1, 'Viewer has rank 1');

    const viewerPerms = getPermissionsForRole('viewer');
    assert(
      viewerPerms.canView === true &&
        viewerPerms.canComment === false &&
        viewerPerms.canEdit === false &&
        viewerPerms.canManage === false,
      'Viewer: canView=true, canComment=false, canEdit=false, canManage=false'
    );

    const commenterPerms = getPermissionsForRole('commenter');
    assert(
      commenterPerms.canView === true &&
        commenterPerms.canComment === true &&
        commenterPerms.canEdit === false &&
        commenterPerms.canManage === false,
      'Commenter: canView=true, canComment=true, canEdit=false, canManage=false'
    );

    const editorPerms = getPermissionsForRole('editor');
    assert(
      editorPerms.canView === true &&
        editorPerms.canComment === true &&
        editorPerms.canEdit === true &&
        editorPerms.canManage === false,
      'Editor: canView=true, canComment=true, canEdit=true, canManage=false'
    );

    const adminPerms = getPermissionsForRole('admin');
    assert(
      adminPerms.canView === true &&
        adminPerms.canComment === true &&
        adminPerms.canEdit === true &&
        adminPerms.canManage === true,
      'Admin: canView=true, canComment=true, canEdit=true, canManage=true'
    );

    const ownerPerms = getPermissionsForRole('owner');
    assert(
      ownerPerms.canView === true &&
        ownerPerms.canComment === true &&
        ownerPerms.canEdit === true &&
        ownerPerms.canManage === true,
      'Owner: canView=true, canComment=true, canEdit=true, canManage=true'
    );

    // -------------------------------------------------------------
    // Setup Test Fixtures in Database
    // -------------------------------------------------------------
    console.log('\n--- Setup Test Users and Workspace Fixtures ---');

    // 1. Owner
    const ownerUser = await prisma.user.create({
      data: { name: 'Owner Olivia', email: `owner_${ts}@matrix.test`, passwordHash },
    });
    const ownerToken = await createTestSession(ownerUser.id);

    // 2. Admin
    const adminUser = await prisma.user.create({
      data: { name: 'Admin Andy', email: `admin_${ts}@matrix.test`, passwordHash },
    });
    const adminToken = await createTestSession(adminUser.id);

    // 3. Editor
    const editorUser = await prisma.user.create({
      data: { name: 'Editor Eric', email: `editor_${ts}@matrix.test`, passwordHash },
    });
    const editorToken = await createTestSession(editorUser.id);

    // 4. Commenter
    const commenterUser = await prisma.user.create({
      data: { name: 'Commenter Chloe', email: `commenter_${ts}@matrix.test`, passwordHash },
    });
    const commenterToken = await createTestSession(commenterUser.id);

    // 5. Viewer
    const viewerUser = await prisma.user.create({
      data: { name: 'Viewer Victor', email: `viewer_${ts}@matrix.test`, passwordHash },
    });
    const viewerToken = await createTestSession(viewerUser.id);

    // 6. Outsider (Not in workspace)
    const outsiderUser = await prisma.user.create({
      data: { name: 'Outsider Oscar', email: `outsider_${ts}@matrix.test`, passwordHash },
    });
    const outsiderToken = await createTestSession(outsiderUser.id);

    // Create Workspace
    const testWorkspace = await prisma.workspace.create({
      data: {
        name: `RBAC Test Workspace ${ts}`,
        slug: `rbac-test-${ts}`,
        ownerId: ownerUser.id,
      },
    });

    // Add Workspace Memberships
    await prisma.workspaceMember.createMany({
      data: [
        { workspaceId: testWorkspace.id, userId: adminUser.id, role: 'admin' },
        { workspaceId: testWorkspace.id, userId: editorUser.id, role: 'editor' },
        { workspaceId: testWorkspace.id, userId: commenterUser.id, role: 'commenter' },
        { workspaceId: testWorkspace.id, userId: viewerUser.id, role: 'viewer' },
      ],
    });

    // Create Initial Document
    const testDoc = await prisma.document.create({
      data: {
        title: 'RBAC Policy Document',
        content: '<p>Initial clean content</p>',
        workspaceId: testWorkspace.id,
        authorId: ownerUser.id,
      },
    });

    console.log(`[Setup] Workspace created: ${testWorkspace.id}`);
    console.log(`[Setup] Document created: ${testDoc.id}`);

    // -------------------------------------------------------------
    // TEST 2: Server-Side Authorization Helper Verification
    // -------------------------------------------------------------
    console.log('\n--- TEST 2: verifyDocumentAccess & verifyWorkspaceAccess Checks ---');

    // Commenter access to document
    const commenterDocAccess = await verifyDocumentAccess(commenterUser.id, testDoc.id, 'viewer');
    assert(commenterDocAccess.userRole === 'commenter', 'Commenter role correctly recognized');
    assert(commenterDocAccess.permissions.canView === true, 'Commenter canView is true');
    assert(commenterDocAccess.permissions.canComment === true, 'Commenter canComment is true');
    assert(commenterDocAccess.permissions.canEdit === false, 'Commenter canEdit is false');

    // Commenter attempting action requiring editor access
    let commenterEditRejected = false;
    try {
      await verifyDocumentAccess(commenterUser.id, testDoc.id, 'editor');
    } catch (err) {
      if (err instanceof AuthError && err.status === 403) {
        commenterEditRejected = true;
      }
    }
    assert(commenterEditRejected, 'Commenter rejected when minRole="editor" is required (403)');

    // Viewer attempting action requiring commenter access
    let viewerCommentRejected = false;
    try {
      await verifyDocumentAccess(viewerUser.id, testDoc.id, 'commenter');
    } catch (err) {
      if (err instanceof AuthError && err.status === 403) {
        viewerCommentRejected = true;
      }
    }
    assert(viewerCommentRejected, 'Viewer rejected when minRole="commenter" is required (403)');

    // Editor accessing with minRole="commenter"
    let editorCommentAllowed = false;
    try {
      const editorDocAccess = await verifyDocumentAccess(editorUser.id, testDoc.id, 'commenter');
      editorCommentAllowed = editorDocAccess.permissions.canComment === true;
    } catch {}
    assert(editorCommentAllowed, 'Editor authorized when minRole="commenter" (role hierarchy preserved)');

    // Outsider rejected completely
    let outsiderRejected = false;
    try {
      await verifyDocumentAccess(outsiderUser.id, testDoc.id, 'viewer');
    } catch (err) {
      if (err instanceof AuthError && err.status === 403) {
        outsiderRejected = true;
      }
    }
    assert(outsiderRejected, 'Outsider rejected with 403 on document access');

    // -------------------------------------------------------------
    // TEST 3: REST API Enforcement Across Roles
    // -------------------------------------------------------------
    console.log('\n--- TEST 3: REST API Enforcement Across Roles ---');
    const BASE_URL = 'http://localhost:3000';

    // 3a. Commenter reads document
    const commenterGetDocRes = await fetch(`${BASE_URL}/api/documents/${testDoc.id}`, {
      headers: { Cookie: `collabspace_session=${commenterToken}` },
    });
    const commenterGetDocData = await commenterGetDocRes.json();
    assert(
      commenterGetDocRes.status === 200,
      'Commenter GET /api/documents/[id] returns 200 OK',
      `Got status ${commenterGetDocRes.status}: ${JSON.stringify(commenterGetDocData)}`
    );
    assert(commenterGetDocData.userRole === 'commenter', 'Response returns userRole: "commenter"');
    assert(commenterGetDocData.permissions?.canView === true, 'Response permissions.canView is true');
    assert(commenterGetDocData.permissions?.canComment === true, 'Response permissions.canComment is true');
    assert(commenterGetDocData.permissions?.canEdit === false, 'Response permissions.canEdit is false');

    // 3a-ii. Viewer reads document
    const viewerGetDocRes = await fetch(`${BASE_URL}/api/documents/${testDoc.id}`, {
      headers: { Cookie: `collabspace_session=${viewerToken}` },
    });
    const viewerGetDocData = await viewerGetDocRes.json();
    assert(viewerGetDocRes.status === 200, 'Viewer GET /api/documents/[id] returns 200 OK');
    assert(viewerGetDocData.userRole === 'viewer', 'Viewer response returns userRole: "viewer"');
    assert(viewerGetDocData.permissions?.canView === true, 'Viewer permissions.canView is true');
    assert(viewerGetDocData.permissions?.canComment === false, 'Viewer permissions.canComment is false');
    assert(viewerGetDocData.permissions?.canEdit === false, 'Viewer permissions.canEdit is false');

    // 3a-iii. Outsider cannot read document
    const outsiderGetDocRes = await fetch(`${BASE_URL}/api/documents/${testDoc.id}`, {
      headers: { Cookie: `collabspace_session=${outsiderToken}` },
    });
    assert(outsiderGetDocRes.status === 403, 'Outsider GET /api/documents/[id] blocked with 403 Forbidden');

    // 3b. Commenter attempts to edit content (MUST BE 403)
    const commenterPatchDocRes = await fetch(`${BASE_URL}/api/documents/${testDoc.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `collabspace_session=${commenterToken}`,
      },
      body: JSON.stringify({ content: '<p>Malicious edit from commenter</p>' }),
    });
    assert(commenterPatchDocRes.status === 403, 'Commenter PATCH content blocked with 403 Forbidden');

    // 3c. Commenter attempts to rename document (MUST BE 403)
    const commenterRenameRes = await fetch(`${BASE_URL}/api/documents/${testDoc.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `collabspace_session=${commenterToken}`,
      },
      body: JSON.stringify({ title: 'Hacked Title By Commenter' }),
    });
    assert(commenterRenameRes.status === 403, 'Commenter PATCH title blocked with 403 Forbidden');

    // 3d. Commenter attempts to delete document (MUST BE 403)
    const commenterDeleteDocRes = await fetch(`${BASE_URL}/api/documents/${testDoc.id}`, {
      method: 'DELETE',
      headers: { Cookie: `collabspace_session=${commenterToken}` },
    });
    assert(commenterDeleteDocRes.status === 403, 'Commenter DELETE document blocked with 403 Forbidden');

    // 3e. Commenter attempts to duplicate document (MUST BE 403)
    const commenterDuplicateRes = await fetch(`${BASE_URL}/api/documents/${testDoc.id}/duplicate`, {
      method: 'POST',
      headers: { Cookie: `collabspace_session=${commenterToken}` },
    });
    assert(commenterDuplicateRes.status === 403, 'Commenter POST /duplicate blocked with 403 Forbidden');

    // 3f. Commenter attempts to restore from trash (MUST BE 403)
    const commenterRestoreTrashRes = await fetch(`${BASE_URL}/api/documents/${testDoc.id}/restore-trash`, {
      method: 'POST',
      headers: { Cookie: `collabspace_session=${commenterToken}` },
    });
    assert(commenterRestoreTrashRes.status === 403, 'Commenter POST /restore-trash blocked with 403 Forbidden');

    // 3g. Commenter attempts to create a document in the workspace (MUST BE 403)
    const commenterCreateDocRes = await fetch(`${BASE_URL}/api/workspaces/${testWorkspace.id}/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `collabspace_session=${commenterToken}`,
      },
      body: JSON.stringify({ title: 'Illegal Doc By Commenter' }),
    });
    assert(commenterCreateDocRes.status === 403, 'Commenter POST /workspaces/[id]/documents blocked with 403 Forbidden');

    // 3h. Commenter reads document version timeline (ALLOWED)
    const commenterGetVersionsRes = await fetch(`${BASE_URL}/api/documents/${testDoc.id}/versions`, {
      headers: { Cookie: `collabspace_session=${commenterToken}` },
    });
    assert(commenterGetVersionsRes.status === 200, 'Commenter GET /versions permitted with 200 OK');

    // 3i. Privilege Escalation Prevention: Commenter attempts to invite member or change role (MUST BE 403)
    const commenterInviteRes = await fetch(`${BASE_URL}/api/workspaces/${testWorkspace.id}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `collabspace_session=${commenterToken}`,
      },
      body: JSON.stringify({ email: `newbie_${ts}@matrix.test`, role: 'admin' }),
    });
    assert(commenterInviteRes.status === 403, 'Privilege escalation: Commenter inviting member blocked with 403');

    // 3j. Editor successfully edits document
    const editorPatchRes = await fetch(`${BASE_URL}/api/documents/${testDoc.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `collabspace_session=${editorToken}`,
      },
      body: JSON.stringify({ title: 'Updated By Editor' }),
    });
    assert(editorPatchRes.status === 200, 'Editor successfully updates document (200 OK)');

    // -------------------------------------------------------------
    // TEST 4: WebSocket Collab Server Security for Commenter
    // -------------------------------------------------------------
    console.log('\n--- TEST 4: Wire-Level WebSocket Security & Mutation Interception ---');

    // 4a. Commenter connects via WebSocket
    const commenterWs = new WebSocket(
      `ws://127.0.0.1:1242/${testDoc.id}?token=${commenterToken}`
    );

    let commenterConnected = false;
    let writePermissionDeniedReceived = false;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Commenter WS connection timeout')), 6000);

      commenterWs.on('open', () => {
        commenterConnected = true;
      });

      commenterWs.on('message', (data: WebSocket.RawData) => {
        const uint8 = new Uint8Array(data as Buffer);
        const decoder = decoding.createDecoder(uint8);
        const msgType = decoding.readVarUint(decoder);

        if (msgType === 2) {
          // messageAuth
          authProtocol.readAuthMessage(decoder, maliciousDoc, (_y, reason) => {
            if (reason.includes('read-only')) {
              writePermissionDeniedReceived = true;
            }
          });
        }

        // Initial sync complete
        if (msgType === 0) {
          clearTimeout(timeout);
          resolve();
        }
      });

      commenterWs.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    assert(commenterConnected, 'Commenter establishes authenticated WebSocket connection');

    // 4b. Malicious Commenter attempts direct binary Yjs write mutation over WebSocket
    const maliciousDoc = new Y.Doc();
    const maliciousText = maliciousDoc.getText('default');
    maliciousText.insert(0, 'MALICIOUS_OVERWRITE_BY_COMMENTER');
    const maliciousUpdate = Y.encodeStateAsUpdate(maliciousDoc);

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0); // messageSync
    syncProtocol.writeUpdate(encoder, maliciousUpdate);
    const payload = encoding.toUint8Array(encoder);

    // Send forbidden mutation
    commenterWs.send(payload);

    // Wait for server to process and respond with permission denied
    await new Promise((resolve) => setTimeout(resolve, 600));

    assert(
      writePermissionDeniedReceived,
      'Server intercepted malicious mutation and returned writePermissionDenied wire protocol error'
    );

    commenterWs.close();

    // 4c. Verify document content in PostgreSQL was completely untouched
    const verifyDoc = await prisma.document.findUnique({
      where: { id: testDoc.id },
      select: { content: true, title: true },
    });
    assert(
      verifyDoc?.content.includes('MALICIOUS') === false,
      'PostgreSQL document content safely untampered by unauthorized mutation'
    );

    // -------------------------------------------------------------
    // TEST 5: Member Role Update API: Promoting/Demoting to Commenter
    // -------------------------------------------------------------
    console.log('\n--- TEST 5: Member Role Management (Admin/Owner assigning Commenter) ---');

    // Find commenter membership record
    const commenterMembership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: testWorkspace.id,
          userId: commenterUser.id,
        },
      },
    });
    assert(!!commenterMembership, 'Commenter membership record exists');

    // Owner promotes commenter to editor
    const promoteRes = await fetch(
      `${BASE_URL}/api/workspaces/${testWorkspace.id}/members/${commenterMembership?.id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `collabspace_session=${ownerToken}`,
        },
        body: JSON.stringify({ role: 'editor' }),
      }
    );
    assert(promoteRes.status === 200, 'Owner successfully promotes member from commenter to editor');

    // Owner demotes member back to commenter
    const demoteRes = await fetch(
      `${BASE_URL}/api/workspaces/${testWorkspace.id}/members/${commenterMembership?.id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `collabspace_session=${ownerToken}`,
        },
        body: JSON.stringify({ role: 'commenter' }),
      }
    );
    assert(demoteRes.status === 200, 'Owner successfully demotes member back to commenter');

    // Admin invites a new commenter
    const inviteCommenterRes = await fetch(
      `${BASE_URL}/api/workspaces/${testWorkspace.id}/members`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `collabspace_session=${adminToken}`,
        },
        body: JSON.stringify({ email: `new_commenter_${ts}@matrix.test`, role: 'commenter' }),
      }
    );
    const inviteData = await inviteCommenterRes.json();
    assert(inviteCommenterRes.status === 201, 'Admin invites new member with role="commenter" (201 Created)');
    assert(inviteData.member?.role === 'commenter', 'Created member has role: "commenter"');

  } finally {
    // Teardown HTTP & Collab Server
    await collab.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));

    // Cleanup database test fixtures
    try {
      await prisma.user.deleteMany({
        where: { email: { contains: `@matrix.test` } },
      });
      console.log('\n[Cleanup] Test fixtures safely purged.');
    } catch {}
  }

  console.log('\n===============================================================');
  console.log(`RBAC PERMISSIONS MATRIX RESULTS: ${passedTests} PASSED, ${failedTests} FAILED (${totalTests} total)`);
  console.log('===============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    setTimeout(() => process.exit(0), 100);
  }
}

runPermissionsMatrixTest();

