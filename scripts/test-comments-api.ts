/**
 * CollabSpace Phase 3: Comprehensive Comments API & Security Test Suite
 * 
 * Verifies:
 * 1. Persistent comments stored in PostgreSQL with parent/reply hierarchy and quote snippets.
 * 2. Strict RBAC enforcement:
 *    - Viewer (Charlie): can view comments (200), cannot post (403), cannot reply (403), cannot resolve (403), cannot delete (403).
 *    - Commenter (Bob): can view (200), can post root comments (201), can reply (201), can edit own comment (200),
 *      cannot edit others' comments (403), cannot edit document content (403).
 *    - Editor/Owner (Alice): can comment, edit, resolve threads, moderate/delete any comment.
 *    - Outsider (Eve): blocked completely (403).
 * 3. Input validation & HTML sanitization against XSS payloads.
 * 4. Reply blocking on resolved threads.
 * 5. Cross-document isolation.
 * 6. Clean database cleanup.
 */

import { prisma } from '../src/lib/prisma';
import { hashPassword, generateSecureToken, hashToken } from '../src/lib/auth/crypto';

const BASE_URL = process.env.TEST_APP_URL || 'http://localhost:3000';

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

async function runCommentsApiTests() {
  console.log('\n===============================================================');
  console.log('   COLLABSPACE PHASE 3: COMMENTS REST API & RBAC TEST SUITE   ');
  console.log('===============================================================\n');

  const ts = Date.now();
  const passwordHash = await hashPassword('SafeTestPass123!');

  // 1. Create Test Users
  const alice = await prisma.user.create({
    data: {
      name: `Alice Owner ${ts}`,
      email: `alice.comments.${ts}@collabspace.dev`,
      passwordHash,
    },
  });

  const bob = await prisma.user.create({
    data: {
      name: `Bob Commenter ${ts}`,
      email: `bob.comments.${ts}@collabspace.dev`,
      passwordHash,
    },
  });

  const charlie = await prisma.user.create({
    data: {
      name: `Charlie Viewer ${ts}`,
      email: `charlie.comments.${ts}@collabspace.dev`,
      passwordHash,
    },
  });

  const eve = await prisma.user.create({
    data: {
      name: `Eve Outsider ${ts}`,
      email: `eve.comments.${ts}@collabspace.dev`,
      passwordHash,
    },
  });

  // 2. Create Sessions
  const aliceToken = await createTestSession(alice.id);
  const bobToken = await createTestSession(bob.id);
  const charlieToken = await createTestSession(charlie.id);
  const eveToken = await createTestSession(eve.id);

  // 3. Create Workspace & Document
  const workspace = await prisma.workspace.create({
    data: {
      name: `Comments WS ${ts}`,
      slug: `comments-ws-${ts}`,
      ownerId: alice.id,
      members: {
        create: [
          { userId: alice.id, role: 'owner' },
          { userId: bob.id, role: 'commenter' },
          { userId: charlie.id, role: 'viewer' },
        ],
      },
    },
  });

  const doc = await prisma.document.create({
    data: {
      title: `Comments Test Doc ${ts}`,
      content: '<p>The agile development sprint commences next Monday at 09:00 AM.</p>',
      workspaceId: workspace.id,
      authorId: alice.id,
    },
  });

  // Isolated Doc 2 for cross-document tests
  const doc2 = await prisma.document.create({
    data: {
      title: `Isolated Doc 2 ${ts}`,
      content: '<p>Isolated content</p>',
      workspaceId: workspace.id,
      authorId: alice.id,
    },
  });

  const makeReq = async (
    path: string,
    method: string,
    token: string,
    body?: Record<string, unknown>
  ) => {
    return fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Cookie: `collabspace_session=${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  try {
    // -------------------------------------------------------------
    // TEST GROUP 1: GET /api/documents/[id]/comments
    // -------------------------------------------------------------
    console.log('--- TEST GROUP 1: Fetch Comments Access & Authorization ---');

    // 1.1 Charlie (Viewer) can fetch comments
    const charlieGet = await makeReq(`/api/documents/${doc.id}/comments`, 'GET', charlieToken);
    assert(charlieGet.status === 200, 'Viewer can fetch comments (200 OK)');
    const charlieGetData = await charlieGet.json();
    assert(charlieGetData.canComment === false, 'Viewer response specifies canComment === false');
    assert(Array.isArray(charlieGetData.comments), 'Comments array returned');
    assert(charlieGetData.userRole === 'viewer', 'Viewer role correctly identified');

    // 1.2 Bob (Commenter) can fetch comments
    const bobGet = await makeReq(`/api/documents/${doc.id}/comments`, 'GET', bobToken);
    assert(bobGet.status === 200, 'Commenter can fetch comments (200 OK)');
    const bobGetData = await bobGet.json();
    assert(bobGetData.canComment === true, 'Commenter response specifies canComment === true');
    assert(bobGetData.userRole === 'commenter', 'Commenter role correctly identified');

    // 1.3 Eve (Outsider) is rejected
    const eveGet = await makeReq(`/api/documents/${doc.id}/comments`, 'GET', eveToken);
    assert(eveGet.status === 403, 'Outsider blocked from fetching comments (403 Forbidden)');

    // -------------------------------------------------------------
    // TEST GROUP 2: POST /api/documents/[id]/comments (Creation & RBAC)
    // -------------------------------------------------------------
    console.log('\n--- TEST GROUP 2: Create Comments RBAC & Validation ---');

    // 2.1 Viewer cannot post comment
    const viewerPost = await makeReq(`/api/documents/${doc.id}/comments`, 'POST', charlieToken, {
      text: 'Viewer attempting to comment',
    });
    assert(viewerPost.status === 403, 'Viewer blocked from posting comment (403 Forbidden)');

    // 2.2 Outsider cannot post comment
    const outsiderPost = await makeReq(`/api/documents/${doc.id}/comments`, 'POST', eveToken, {
      text: 'Outsider attempting to comment',
    });
    assert(outsiderPost.status === 403, 'Outsider blocked from posting comment (403 Forbidden)');

    // 2.3 Empty comment rejected
    const emptyPost = await makeReq(`/api/documents/${doc.id}/comments`, 'POST', bobToken, {
      text: '   ',
    });
    assert(emptyPost.status === 400, 'Empty comment text rejected (400 Bad Request)');

    // 2.4 Commenter posts valid root comment with quote
    const bobPost = await makeReq(`/api/documents/${doc.id}/comments`, 'POST', bobToken, {
      text: 'Should we shift the time to 10:00 AM?',
      quote: 'next Monday at 09:00 AM',
      anchorPosition: 'text-range:35-58',
    });
    assert(bobPost.status === 201, 'Commenter can post comment with quote (201 Created)');
    const bobPostData = await bobPost.json();
    assert(bobPostData.comment && bobPostData.comment.id, 'Created comment returned with valid ID');
    assert(bobPostData.comment.selectedTextSnippet === 'next Monday at 09:00 AM', 'Quoted snippet preserved');
    assert(bobPostData.comment.author.name === bob.name, 'Author correctly recorded');
    assert(bobPostData.comment.resolved === false, 'Initial state is unresolved');

    const rootCommentId = bobPostData.comment.id;

    // Verify in PostgreSQL directly
    const dbComment = await prisma.comment.findUnique({
      where: { id: rootCommentId },
    });
    assert(!!dbComment, 'Comment record exists in PostgreSQL comments table');
    assert(dbComment?.authorId === bob.id, 'Comment authorId matches Bob in database');
    assert(dbComment?.quote === 'next Monday at 09:00 AM', 'Quote stored in PostgreSQL');

    // 2.5 XSS Sanitization
    const xssPost = await makeReq(`/api/documents/${doc.id}/comments`, 'POST', bobToken, {
      text: 'Security check <script>alert("xss")</script><b>Bold label</b>',
      quote: '<img src=x onerror=alert(1)>Quoted text',
    });
    assert(xssPost.status === 201, 'Comment with HTML tags accepted for sanitization (201 Created)');
    const xssPostData = await xssPost.json();
    const xssDbComment = await prisma.comment.findUnique({ where: { id: xssPostData.comment.id } });
    assert(!xssDbComment?.text.includes('<script>'), 'Script tag stripped from comment text');
    assert(!xssDbComment?.quote?.includes('onerror'), 'Event handler stripped from comment quote');

    // -------------------------------------------------------------
    // TEST GROUP 3: Threaded Replies (Nested Comments)
    // -------------------------------------------------------------
    console.log('\n--- TEST GROUP 3: Threaded Replies & Parent Validation ---');

    // 3.1 Viewer cannot reply
    const viewerReply = await makeReq(`/api/documents/${doc.id}/comments`, 'POST', charlieToken, {
      text: 'Viewer reply attempt',
      parentId: rootCommentId,
    });
    assert(viewerReply.status === 403, 'Viewer blocked from replying (403 Forbidden)');

    // 3.2 Non-existent parentId rejected
    const badParentReply = await makeReq(`/api/documents/${doc.id}/comments`, 'POST', bobToken, {
      text: 'Orphan reply',
      parentId: '00000000-0000-0000-0000-000000000000',
    });
    assert(badParentReply.status === 404, 'Non-existent parentId rejected (404 Not Found)');

    // 3.3 Alice (Owner) replies to Bob's comment
    const aliceReply = await makeReq(`/api/documents/${doc.id}/comments`, 'POST', aliceToken, {
      text: '10:00 AM works perfectly for the engineering team.',
      parentId: rootCommentId,
    });
    assert(aliceReply.status === 201, 'Owner can reply to comment thread (201 Created)');
    const aliceReplyData = await aliceReply.json();
    assert(aliceReplyData.comment.parentId === rootCommentId, 'Reply parentId matches root comment');

    const replyId = aliceReplyData.comment.id;

    // 3.4 Bob replies to Alice in the same thread
    const bobReply2 = await makeReq(`/api/documents/${doc.id}/comments`, 'POST', bobToken, {
      text: 'Great, I will update the calendar invite.',
      parentId: rootCommentId,
    });
    assert(bobReply2.status === 201, 'Commenter can reply in thread (201 Created)');

    // Verify GET retrieves nested replies
    const updatedGet = await makeReq(`/api/documents/${doc.id}/comments`, 'GET', bobToken);
    const updatedGetData = await updatedGet.json();
    const thread = updatedGetData.comments.find((c: { id: string }) => c.id === rootCommentId);
    assert(thread && thread.replies.length === 2, 'GET returns root thread with 2 nested replies');
    assert(thread?.replies[0]?.author?.name === alice.name, 'First reply author is Alice');
    assert(thread?.replies[1]?.author?.name === bob.name, 'Second reply author is Bob');

    // -------------------------------------------------------------
    // TEST GROUP 4: PATCH /api/documents/[id]/comments/[commentId]
    // -------------------------------------------------------------
    console.log('\n--- TEST GROUP 4: Comment Text Editing & Resolve Workflow ---');

    // 4.1 Viewer cannot edit or resolve
    const viewerPatch = await makeReq(
      `/api/documents/${doc.id}/comments/${rootCommentId}`,
      'PATCH',
      charlieToken,
      { resolved: true }
    );
    assert(viewerPatch.status === 403, 'Viewer blocked from resolving thread (403 Forbidden)');

    // 4.2 User cannot edit another user's comment text
    const unauthorizedEdit = await makeReq(
      `/api/documents/${doc.id}/comments/${rootCommentId}`,
      'PATCH',
      aliceToken,
      { text: 'Alice attempting to alter Bob text' }
    );
    assert(unauthorizedEdit.status === 403, 'Non-author blocked from editing comment text (403 Forbidden)');

    // 4.3 Author (Bob) edits his own comment text
    const bobEdit = await makeReq(
      `/api/documents/${doc.id}/comments/${rootCommentId}`,
      'PATCH',
      bobToken,
      { text: 'Should we shift the kickoff time to 10:00 AM sharp?' }
    );
    assert(bobEdit.status === 200, 'Author can edit their own comment text (200 OK)');
    const bobEditData = await bobEdit.json();
    assert(bobEditData.comment.text === 'Should we shift the kickoff time to 10:00 AM sharp?', 'Text updated in response');

    // 4.4 Alice (Editor/Owner) resolves the thread
    const resolveRes = await makeReq(
      `/api/documents/${doc.id}/comments/${rootCommentId}`,
      'PATCH',
      aliceToken,
      { resolved: true }
    );
    assert(resolveRes.status === 200, 'Editor/Owner can resolve thread (200 OK)');
    const resolveData = await resolveRes.json();
    assert(resolveData.comment.resolved === true, 'Thread resolved === true');
    assert(resolveData.comment.resolvedBy?.name === alice.name, 'ResolvedBy recorded as Alice');

    // Verify in PostgreSQL
    const resolvedDb = await prisma.comment.findUnique({ where: { id: rootCommentId } });
    assert(resolvedDb?.resolved === true, 'PostgreSQL resolved flag is true');
    assert(resolvedDb?.resolvedById === alice.id, 'PostgreSQL resolvedById matches Alice');
    assert(resolvedDb?.resolvedAt !== null, 'PostgreSQL resolvedAt timestamp recorded');

    // 4.5 Replying to resolved thread is rejected
    const blockedReply = await makeReq(`/api/documents/${doc.id}/comments`, 'POST', bobToken, {
      text: 'Trying to reply to a resolved thread',
      parentId: rootCommentId,
    });
    assert(blockedReply.status === 400, 'Reply to resolved thread rejected (400 Bad Request)');

    // 4.6 Alice reopens the thread
    const reopenRes = await makeReq(
      `/api/documents/${doc.id}/comments/${rootCommentId}`,
      'PATCH',
      aliceToken,
      { resolved: false }
    );
    assert(reopenRes.status === 200, 'Thread can be reopened (200 OK)');
    const reopenData = await reopenRes.json();
    assert(reopenData.comment.resolved === false, 'Thread resolved === false after reopening');

    // -------------------------------------------------------------
    // TEST GROUP 5: DELETE /api/documents/[id]/comments/[commentId]
    // -------------------------------------------------------------
    console.log('\n--- TEST GROUP 5: Deletion RBAC & Cleanup ---');

    // 5.1 Viewer cannot delete
    const viewerDelete = await makeReq(
      `/api/documents/${doc.id}/comments/${replyId}`,
      'DELETE',
      charlieToken
    );
    assert(viewerDelete.status === 403, 'Viewer blocked from deleting comments (403 Forbidden)');

    // 5.2 Outsider cannot delete
    const outsiderDelete = await makeReq(
      `/api/documents/${doc.id}/comments/${replyId}`,
      'DELETE',
      eveToken
    );
    assert(outsiderDelete.status === 403, 'Outsider blocked from deleting comments (403 Forbidden)');

    // 5.3 Non-author non-manager cannot delete
    // Bob is a commenter, trying to delete Alice's reply
    const bobDeleteAliceReply = await makeReq(
      `/api/documents/${doc.id}/comments/${replyId}`,
      'DELETE',
      bobToken
    );
    assert(bobDeleteAliceReply.status === 403, 'Commenter blocked from deleting another user reply (403 Forbidden)');

    // 5.4 Author (Alice) deletes her own reply
    const aliceDeleteOwnReply = await makeReq(
      `/api/documents/${doc.id}/comments/${replyId}`,
      'DELETE',
      aliceToken
    );
    assert(aliceDeleteOwnReply.status === 200, 'Author can delete their own reply (200 OK)');
    const deletedReplyInDb = await prisma.comment.findUnique({ where: { id: replyId } });
    assert(deletedReplyInDb === null, 'Reply record deleted from PostgreSQL');

    // 5.5 Manager (Alice) deletes Bob's root thread
    const managerDeleteThread = await makeReq(
      `/api/documents/${doc.id}/comments/${rootCommentId}`,
      'DELETE',
      aliceToken
    );
    assert(managerDeleteThread.status === 200, 'Workspace Owner can moderate/delete any comment (200 OK)');
    const deletedThreadInDb = await prisma.comment.findUnique({ where: { id: rootCommentId } });
    assert(deletedThreadInDb === null, 'Thread record deleted from PostgreSQL');

    // -------------------------------------------------------------
    // TEST GROUP 6: Cross-Document Isolation
    // -------------------------------------------------------------
    console.log('\n--- TEST GROUP 6: Cross-Document Comment Isolation ---');

    // Post comment in Doc 2
    const doc2Post = await makeReq(`/api/documents/${doc2.id}/comments`, 'POST', bobToken, {
      text: 'Comment strictly belonging to Document 2',
    });
    assert(doc2Post.status === 201, 'Comment created in Doc 2');

    // Fetch Doc 1 comments: should NOT contain Doc 2 comment
    const doc1Comments = await makeReq(`/api/documents/${doc.id}/comments`, 'GET', bobToken);
    const doc1Data = await doc1Comments.json();
    const doc2CommentInDoc1 = doc1Data.comments.find(
      (c: { text: string }) => c.text === 'Comment strictly belonging to Document 2'
    );
    assert(!doc2CommentInDoc1, 'Document 1 comment feed does NOT leak Document 2 comments');

    // -------------------------------------------------------------
    // TEST GROUP 7: Commenter CANNOT edit document content
    // -------------------------------------------------------------
    console.log('\n--- TEST GROUP 7: Commenter Cannot Edit Document Content ---');

    const bobDocEdit = await makeReq(`/api/documents/${doc.id}`, 'PATCH', bobToken, {
      content: '<p>Malicious document takeover by commenter</p>',
    });
    assert(bobDocEdit.status === 403, 'Commenter blocked from modifying document content (403 Forbidden)');
  } finally {
    // Teardown test data
    console.log('\n--- TEARDOWN: Cleaning up test fixtures ---');
    await prisma.comment.deleteMany({
      where: { documentId: { in: [doc.id, doc2.id] } },
    });
    await prisma.document.deleteMany({
      where: { id: { in: [doc.id, doc2.id] } },
    });
    await prisma.workspaceMember.deleteMany({
      where: { workspaceId: workspace.id },
    });
    await prisma.workspace.delete({
      where: { id: workspace.id },
    });
    await prisma.session.deleteMany({
      where: { userId: { in: [alice.id, bob.id, charlie.id, eve.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [alice.id, bob.id, charlie.id, eve.id] } },
    });
    console.log('Teardown complete.');
  }

  console.log('\n===============================================================');
  console.log(`TOTAL TESTS:  ${totalTests}`);
  console.log(`PASSED TESTS: ${passedTests}`);
  console.log(`FAILED TESTS: ${failedTests}`);
  console.log('===============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runCommentsApiTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
