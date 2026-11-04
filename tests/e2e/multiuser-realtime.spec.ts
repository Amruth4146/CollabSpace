import { test, expect } from '@playwright/test';
import { getRedisClient } from '../../src/lib/redis';
import { prisma } from '../../src/lib/prisma';

test.describe('Real-Time Multi-User Collaboration E2E (Two Independent Browser Sessions)', () => {
  test.beforeEach(async () => {
    // Clean up local rate limits so automated test suites can execute without 429 delays
    try {
      const redis = getRedisClient();
      const keys = await redis.keys('ratelimit:*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      await prisma.rateLimitRecord.deleteMany();
    } catch {}
  });

  test('Two users open the same document, edit concurrently, see presence, and verify DB persistence', async ({ browser }) => {
    const timestamp = Date.now();
    const userA_Name = `Alice ${timestamp}`;
    const userA_Email = `alice_${timestamp}@collabspace.test`;
    const userB_Name = `Bob ${timestamp}`;
    const userB_Email = `bob_${timestamp}@collabspace.test`;
    const password = 'Password123!Safe';

    // 1. Browser Context A (User A)
    const contextA = await browser.newContext({ baseURL: 'http://localhost:3000' });
    const pageA = await contextA.newPage();
    pageA.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        console.log('[PageA Console]', msg.type(), msg.text());
      }
    });

    // Register User A
    await pageA.goto('http://localhost:3000/signup');
    await pageA.fill('#fullName', userA_Name);
    await pageA.fill('#signupEmail', userA_Email);
    await pageA.fill('#signupPassword', password);
    await pageA.fill('#confirmSignupPassword', password);
    await pageA.getByRole('button', { name: 'Create Free Account' }).click();
    await expect(pageA).toHaveURL(/\/login/);

    // Sign in User A
    await pageA.fill('#email', userA_Email);
    await pageA.fill('#password', password);
    await pageA.getByRole('button', { name: /Sign In to CollabSpace/i }).click();
    await expect(pageA).toHaveURL(/\/dashboard/);

    // Get User A workspace and documents from API
    const userA_MeRes = await pageA.request.get('http://localhost:3000/api/auth/me');
    const userA_Data = await userA_MeRes.json();
    const workspaceId = userA_Data.workspaces[0].id;

    // Get starter document ID
    const docsRes = await pageA.request.get(`http://localhost:3000/api/workspaces/${workspaceId}/documents`);
    const docsData = await docsRes.json();
    expect(docsData.documents.length).toBeGreaterThan(0);
    const documentId = docsData.documents[0].id;

    // 2. Browser Context B (User B)
    const contextB = await browser.newContext({ baseURL: 'http://localhost:3000' });
    const pageB = await contextB.newPage();
    pageB.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        console.log('[PageB Console]', msg.type(), msg.text());
      }
    });

    // Register User B
    await pageB.goto('http://localhost:3000/signup');
    await pageB.fill('#fullName', userB_Name);
    await pageB.fill('#signupEmail', userB_Email);
    await pageB.fill('#signupPassword', password);
    await pageB.fill('#confirmSignupPassword', password);
    await pageB.getByRole('button', { name: 'Create Free Account' }).click();
    await expect(pageB).toHaveURL(/\/login/);

    // Sign in User B
    await pageB.fill('#email', userB_Email);
    await pageB.fill('#password', password);
    await pageB.getByRole('button', { name: /Sign In to CollabSpace/i }).click();
    await expect(pageB).toHaveURL(/\/dashboard/);

    // 3. User A invites User B as Editor to User A's workspace
    const inviteRes = await pageA.request.post(`http://localhost:3000/api/workspaces/${workspaceId}/members`, {
      data: {
        email: userB_Email,
        role: 'editor',
      },
    });
    expect(inviteRes.ok()).toBe(true);

    // 4. Open the shared document in both browser sessions
    await pageA.goto(`http://localhost:3000/editor/${documentId}`);
    await pageB.goto(`http://localhost:3000/editor/${documentId}`);

    // Wait for editors to load and connect
    await pageA.waitForSelector('.tiptap', { timeout: 15000 });
    await pageB.waitForSelector('.tiptap', { timeout: 15000 });

    // Verify both indicate live sync connection
    await expect(pageA.locator('text=Live Sync Active')).toBeVisible({ timeout: 10000 });
    await expect(pageB.locator('text=Live Sync Active')).toBeVisible({ timeout: 10000 });

    // 5. Verify collaborator presence: Bob appears in Alice's session, Alice appears in Bob's session
    await expect(pageA.locator('.border-t').getByText(userB_Name)).toBeVisible({ timeout: 10000 });
    await expect(pageB.locator('.border-t').getByText(userA_Name)).toBeVisible({ timeout: 10000 });

    // 6. User A edits document
    const editorA = pageA.locator('.tiptap');
    await editorA.click();
    const testTextFromA = `[Alice Typed ${timestamp}] `;
    await pageA.keyboard.type(testTextFromA, { delay: 50 });

    // 7. Verify User B sees Alice's text in real-time without reloading
    const editorB = pageB.locator('.tiptap');
    await expect(editorB).toContainText(testTextFromA, { timeout: 10000 });

    // 8. User B edits document at the end
    await pageB.evaluate(() => {
      const el = document.querySelector('.tiptap');
      if (el) {
        (el as HTMLElement).focus();
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    });
    await pageB.keyboard.press('Enter');
    const testTextFromB = `[Bob Replied ${timestamp}] `;
    await pageB.keyboard.type(testTextFromB, { delay: 50 });

    // 9. Verify User A sees Bob's text in real-time without reloading
    await expect(editorA).toContainText(testTextFromB, { timeout: 10000 });

    // 10. Wait for debounced PostgreSQL persistence
    await pageA.waitForTimeout(2500);

    // 11. Refresh User A's browser and verify content persisted to PostgreSQL
    await pageA.reload();
    await pageA.waitForSelector('.tiptap', { timeout: 15000 });
    await expect(pageA.locator('.tiptap')).toContainText(testTextFromA);
    await expect(pageA.locator('.tiptap')).toContainText(testTextFromB);

    // Teardown contexts
    await contextA.close();
    await contextB.close();
  });
});
