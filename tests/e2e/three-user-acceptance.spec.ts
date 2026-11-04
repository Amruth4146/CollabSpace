import { test, expect } from '@playwright/test';
import { getRedisClient } from '../../src/lib/redis';
import { prisma } from '../../src/lib/prisma';
import WebSocket from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as authProtocol from 'y-protocols/auth';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

test.describe('STEP 2: Three-User Acceptance Test (Editor, Commenter, Viewer)', () => {
  test.beforeEach(async () => {
    try {
      const redis = getRedisClient();
      const keys = await redis.keys('ratelimit:*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      await prisma.rateLimitRecord.deleteMany();
    } catch {}
  });

  test('Three-User Full Acceptance Flow: Editing, Permissions, Inline Comments, Sync, Persistence & Wire-level Security', async ({ browser }) => {
    test.setTimeout(90000);
    const timestamp = Date.now();
    const userA_Name = `Alice Editor ${timestamp}`;
    const userA_Email = `alice_step2_${timestamp}@collabspace.test`;
    const userB_Name = `Bob Commenter ${timestamp}`;
    const userB_Email = `bob_step2_${timestamp}@collabspace.test`;
    const userC_Name = `Charlie Viewer ${timestamp}`;
    const userC_Email = `charlie_step2_${timestamp}@collabspace.test`;
    const password = 'Password123!Safe';

    // -------------------------------------------------------------------------
    // 1. SETUP USER A (Editor / Owner)
    // -------------------------------------------------------------------------
    const contextA = await browser.newContext({ baseURL: 'http://localhost:3000' });
    const pageA = await contextA.newPage();

    await pageA.goto('http://localhost:3000/signup');
    await pageA.fill('#fullName', userA_Name);
    await pageA.fill('#signupEmail', userA_Email);
    await pageA.fill('#signupPassword', password);
    await pageA.fill('#confirmSignupPassword', password);
    await pageA.getByRole('button', { name: 'Create Free Account' }).click();
    await expect(pageA).toHaveURL(/\/login/);

    await pageA.fill('#email', userA_Email);
    await pageA.fill('#password', password);
    await pageA.getByRole('button', { name: /Sign In to CollabSpace/i }).click();
    await expect(pageA).toHaveURL(/\/dashboard/);

    const userA_MeRes = await pageA.request.get('http://localhost:3000/api/auth/me');
    const userA_Data = await userA_MeRes.json();
    const workspaceId = userA_Data.workspaces[0].id;

    const docsRes = await pageA.request.get(`http://localhost:3000/api/workspaces/${workspaceId}/documents`);
    const docsData = await docsRes.json();
    const documentId = docsData.documents[0].id;

    // -------------------------------------------------------------------------
    // 2. SETUP USER B (Commenter)
    // -------------------------------------------------------------------------
    const contextB = await browser.newContext({ baseURL: 'http://localhost:3000' });
    const pageB = await contextB.newPage();

    await pageB.goto('http://localhost:3000/signup');
    await pageB.fill('#fullName', userB_Name);
    await pageB.fill('#signupEmail', userB_Email);
    await pageB.fill('#signupPassword', password);
    await pageB.fill('#confirmSignupPassword', password);
    await pageB.getByRole('button', { name: 'Create Free Account' }).click();
    await expect(pageB).toHaveURL(/\/login/);

    await pageB.fill('#email', userB_Email);
    await pageB.fill('#password', password);
    await pageB.getByRole('button', { name: /Sign In to CollabSpace/i }).click();
    await expect(pageB).toHaveURL(/\/dashboard/);

    // Invite User B as Commenter
    const inviteB = await pageA.request.post(`http://localhost:3000/api/workspaces/${workspaceId}/members`, {
      data: { email: userB_Email, role: 'commenter' },
    });
    expect(inviteB.ok()).toBe(true);

    // -------------------------------------------------------------------------
    // 3. SETUP USER C (Viewer)
    // -------------------------------------------------------------------------
    const contextC = await browser.newContext({ baseURL: 'http://localhost:3000' });
    const pageC = await contextC.newPage();

    await pageC.goto('http://localhost:3000/signup');
    await pageC.fill('#fullName', userC_Name);
    await pageC.fill('#signupEmail', userC_Email);
    await pageC.fill('#signupPassword', password);
    await pageC.fill('#confirmSignupPassword', password);
    await pageC.getByRole('button', { name: 'Create Free Account' }).click();
    await expect(pageC).toHaveURL(/\/login/);

    await pageC.fill('#email', userC_Email);
    await pageC.fill('#password', password);
    await pageC.getByRole('button', { name: /Sign In to CollabSpace/i }).click();
    await expect(pageC).toHaveURL(/\/dashboard/);

    // Invite User C as Viewer
    const inviteC = await pageA.request.post(`http://localhost:3000/api/workspaces/${workspaceId}/members`, {
      data: { email: userC_Email, role: 'viewer' },
    });
    expect(inviteC.ok()).toBe(true);

    // -------------------------------------------------------------------------
    // 4. OPEN DOCUMENT IN ALL THREE SESSIONS
    // -------------------------------------------------------------------------
    await pageA.goto(`http://localhost:3000/editor/${documentId}`);
    await pageB.goto(`http://localhost:3000/editor/${documentId}`);
    await pageC.goto(`http://localhost:3000/editor/${documentId}`);

    await pageA.waitForSelector('.tiptap', { timeout: 15000 });
    await pageB.waitForSelector('.tiptap', { timeout: 15000 });
    await pageC.waitForSelector('.tiptap', { timeout: 15000 });

    // VERIFICATION: User A (Editor) can edit
    const editorA = pageA.locator('.tiptap');
    await editorA.click();
    await pageA.keyboard.press('End');
    await pageA.keyboard.type(' Important Section Anchor Text');
    await expect(pageA.locator('.tiptap')).toContainText('Important Section Anchor Text');

    // VERIFICATION: User B (Commenter) editor is contenteditable="false" (cannot edit)
    const editorB = pageB.locator('.tiptap');
    await expect(editorB).toHaveAttribute('contenteditable', 'false');

    // VERIFICATION: User C (Viewer) editor is contenteditable="false" (cannot edit)
    const editorC = pageC.locator('.tiptap');
    await expect(editorC).toHaveAttribute('contenteditable', 'false');

    // Wait for User B to receive User A's typed text via Yjs CRDT
    await expect(pageB.locator('.tiptap')).toContainText('Important Section Anchor Text', { timeout: 10000 });
    await expect(pageC.locator('.tiptap')).toContainText('Important Section Anchor Text', { timeout: 10000 });

    // -------------------------------------------------------------------------
    // 5. USER B SELECTS TEXT IN READ-ONLY MODE & CREATES ATTACHED COMMENT
    // -------------------------------------------------------------------------
    // User B selects "Important Section" text in the read-only DOM
    await pageB.evaluate(() => {
      const el = document.querySelector('.tiptap');
      if (!el) return;
      const textNode = Array.from(el.querySelectorAll('p, h1, h2, h3, div, span'))
        .flatMap((n) => Array.from(n.childNodes))
        .find((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.includes('Important Section'));
      if (textNode && textNode.textContent) {
        const start = textNode.textContent.indexOf('Important Section');
        const range = document.createRange();
        range.setStart(textNode, start);
        range.setEnd(textNode, start + 'Important Section'.length);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
      }
    });

    // The read-only selection toolbar displays "Add Comment" button
    const addCommentBtnB = pageB.getByRole('button', { name: 'Add Comment' });
    await expect(addCommentBtnB).toBeVisible({ timeout: 5000 });
    await addCommentBtnB.click();

    // Verify comments sidebar opens on User B and pre-fills quote preview
    await expect(pageB.locator('aside').filter({ hasText: 'Comments' })).toBeVisible();
    await expect(pageB.locator('aside').getByText(/Important Section/)).toBeVisible();

    // User B posts a comment on the quote
    const commentInputB = pageB.locator('aside input[type="text"]').first();
    await commentInputB.fill('Bob reviewing this section: Looks clear and accurate.');
    await pageB.locator('aside').getByRole('button', { name: 'Post' }).click();

    // Verify comment appears in User B's thread list with attached quote
    await expect(pageB.locator('aside').getByText('Bob reviewing this section: Looks clear and accurate.')).toBeVisible({
      timeout: 10000,
    });
    await expect(pageB.locator('aside').getByText(/Important Section/)).toBeVisible();

    // -------------------------------------------------------------------------
    // 6. USER A RECEIVES COMMENT WITHOUT REFRESHING
    // -------------------------------------------------------------------------
    // Open comments sidebar on User A
    const commentsToggleBtnA = pageA.locator('button[title*="Comments"]').or(pageA.getByRole('button', { name: /Comments/i }));
    await commentsToggleBtnA.first().click();
    await expect(pageA.locator('aside').filter({ hasText: 'Comments' })).toBeVisible();

    // Verify User A receives Bob's comment and quote live without reloading
    await expect(pageA.locator('aside').getByText('Bob reviewing this section: Looks clear and accurate.')).toBeVisible({
      timeout: 10000,
    });
    await expect(pageA.locator('aside').getByText(/Important Section/)).toBeVisible();

    // -------------------------------------------------------------------------
    // 7. USER A REPLIES & RESOLVES THE THREAD
    // -------------------------------------------------------------------------
    const replyInputA = pageA.locator('input[placeholder*="Reply"]').first();
    await replyInputA.fill('Alice: Thank you Bob for the quick signoff.');
    await pageA.getByRole('button', { name: 'Reply' }).first().click();

    await expect(pageA.locator('aside').getByText('Alice: Thank you Bob for the quick signoff.')).toBeVisible({
      timeout: 10000,
    });

    // User B receives Alice's reply live without refresh
    await expect(pageB.locator('aside').getByText('Alice: Thank you Bob for the quick signoff.')).toBeVisible({
      timeout: 10000,
    });

    // User A marks the thread as resolved
    const markResolvedBtn = pageA.locator('button[title="Mark as resolved"]').first();
    await markResolvedBtn.click();

    // Both User A and User B see updated tab counters: Open (0), Resolved (1)
    await expect(pageA.getByRole('button', { name: /Resolved \(1\)/i })).toBeVisible({ timeout: 10000 });
    await expect(pageB.getByRole('button', { name: /Resolved \(1\)/i })).toBeVisible({ timeout: 10000 });

    // Open Resolved tab on User B and verify thread
    await pageB.getByRole('button', { name: /Resolved \(1\)/i }).click();
    await expect(pageB.locator('aside').getByText('Bob reviewing this section: Looks clear and accurate.')).toBeVisible();

    // -------------------------------------------------------------------------
    // 8. COMMENTS PERSIST AFTER REFRESH
    // -------------------------------------------------------------------------
    await pageA.reload();
    await pageA.waitForSelector('.tiptap', { timeout: 15000 });
    const toggleA_AfterReload = pageA.locator('button[title*="Comments"]').or(pageA.getByRole('button', { name: /Comments/i }));
    await toggleA_AfterReload.first().click();
    await pageA.getByRole('button', { name: /Resolved \(1\)/i }).click();
    await expect(pageA.locator('aside').getByText('Bob reviewing this section: Looks clear and accurate.')).toBeVisible();
    await expect(pageA.locator('aside').getByText('Alice: Thank you Bob for the quick signoff.')).toBeVisible();

    // -------------------------------------------------------------------------
    // 9. USER C (VIEWER) PERMISSIONS & RESTRICTION VERIFICATION
    // -------------------------------------------------------------------------
    const toggleC = pageC.locator('button[title*="Comments"]').or(pageC.getByRole('button', { name: /Comments/i }));
    await toggleC.first().click();
    await expect(pageC.locator('aside').getByText(/Viewer role: You have read-only access to comments/i)).toBeVisible();
    await expect(pageC.locator('aside').getByRole('button', { name: 'Post' })).not.toBeVisible();

    // Attempt direct REST mutations from User C (Viewer)
    const viewerPostAttempt = await pageC.request.post(`http://localhost:3000/api/documents/${documentId}/comments`, {
      data: { text: 'Unauthorized viewer comment' },
    });
    expect(viewerPostAttempt.status()).toBe(403);

    const viewerDocEditAttempt = await pageC.request.patch(`http://localhost:3000/api/documents/${documentId}`, {
      data: { content: '<p>Malicious edit by viewer</p>' },
    });
    expect(viewerDocEditAttempt.status()).toBe(403);

    // Attempt direct REST mutations from User B (Commenter modifying doc content)
    const commenterDocEditAttempt = await pageB.request.patch(`http://localhost:3000/api/documents/${documentId}`, {
      data: { content: '<p>Malicious edit by commenter</p>' },
    });
    expect(commenterDocEditAttempt.status()).toBe(403);

    // -------------------------------------------------------------------------
    // 10. UNAUTHORIZED WIRE-LEVEL WEBSOCKET MUTATION ATTEMPT (COMMENTER)
    // -------------------------------------------------------------------------
    // Connect User B over raw WebSocket and attempt to send a Yjs mutation
    const bCookies = await contextB.cookies();
    const bSessionCookie = bCookies.find((c) => c.name === 'collabspace_session')?.value;
    expect(bSessionCookie).toBeDefined();

    const ws = new WebSocket(`ws://localhost:1234/${documentId}?token=${bSessionCookie}`);
    let permissionDeniedReceived = false;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => resolve(), 6000);

      ws.on('open', () => {
        // Send initial SyncStep1
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, 0); // messageSync
        syncProtocol.writeSyncStep1(encoder, new Y.Doc());
        ws.send(encoding.toUint8Array(encoder));

        // Create an unauthorized malicious text insertion update
        const fakeDoc = new Y.Doc();
        fakeDoc.getText('default').insert(0, 'MALICIOUS_WIRE_MUTATION_BY_COMMENTER');
        const maliciousUpdate = Y.encodeStateAsUpdate(fakeDoc);

        // Send unauthorized mutation
        const updateEncoder = encoding.createEncoder();
        encoding.writeVarUint(updateEncoder, 0); // messageSync
        syncProtocol.writeUpdate(updateEncoder, maliciousUpdate);
        ws.send(encoding.toUint8Array(updateEncoder));
      });

      ws.on('message', (data: Buffer | ArrayBuffer) => {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        const decoder = decoding.createDecoder(new Uint8Array(buf));
        const messageType = decoding.readVarUint(decoder);

        if (messageType === 2) { // messageAuth
          authProtocol.readAuthMessage(decoder, new Y.Doc(), (_y, reason) => {
            if (reason.includes('Permission denied') || reason.includes('read-only')) {
              permissionDeniedReceived = true;
              clearTimeout(timeout);
              ws.close();
              resolve();
            }
          });
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    expect(permissionDeniedReceived).toBe(true);

    // Verify document content in PostgreSQL remains untampered
    const dbDoc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { content: true },
    });
    expect(dbDoc?.content).not.toContain('MALICIOUS_WIRE_MUTATION_BY_COMMENTER');

    // Close browser contexts
    await contextA.close();
    await contextB.close();
    await contextC.close();
  });
});
