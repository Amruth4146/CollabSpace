import { test, expect } from '@playwright/test';
import { getRedisClient } from '../../src/lib/redis';
import { prisma } from '../../src/lib/prisma';

test.describe('STEP 3: Two-Editor Real-Time Collaboration & History Restore E2E', () => {
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

  test('Two editors collaborate concurrently with bidirectional sync, presence, disconnect/reconnect & safe version restore', async ({ browser }) => {
    test.setTimeout(120000);
    const timestamp = Date.now();
    const userA_Name = `Editor Alice ${timestamp}`;
    const userA_Email = `alice_collab_${timestamp}@collabspace.test`;
    const userB_Name = `Editor Bob ${timestamp}`;
    const userB_Email = `bob_collab_${timestamp}@collabspace.test`;
    const password = 'Password123!Safe';

    // 1. Setup User A (Editor / Owner)
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

    // 2. Setup User B (Editor)
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

    // Invite User B as Editor
    const inviteB = await pageA.request.post(`http://localhost:3000/api/workspaces/${workspaceId}/members`, {
      data: { email: userB_Email, role: 'editor' },
    });
    expect(inviteB.ok()).toBe(true);

    // 3. Both open document simultaneously
    await pageA.goto(`http://localhost:3000/editor/${documentId}`);
    await pageB.goto(`http://localhost:3000/editor/${documentId}`);

    await pageA.waitForSelector('.tiptap', { timeout: 15000 });
    await pageB.waitForSelector('.tiptap', { timeout: 15000 });

    // Verify presence: 2 Peers in room on both pages
    await expect(pageA.getByText('2 Peers in room')).toBeVisible({ timeout: 10000 });
    await expect(pageB.getByText('2 Peers in room')).toBeVisible({ timeout: 10000 });

    // Verify collaborator indicator and avatar color
    await expect(pageA.locator('.border-t').getByText(userB_Name)).toBeVisible();
    await expect(pageB.locator('.border-t').getByText(userA_Name)).toBeVisible();

    // 4. Concurrent bidirectional text editing
    const editorA = pageA.locator('.tiptap');
    await editorA.click();
    const aliceChunk = `[Alpha_${timestamp}] `;
    await pageA.keyboard.type(aliceChunk, { delay: 30 });

    // User B types at the same time
    const editorB = pageB.locator('.tiptap');
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
    const bobChunk = ` [Omega_${timestamp}]`;
    await pageB.keyboard.type(bobChunk, { delay: 30 });

    // Verify both editors converge and contain both chunks without conflict
    await expect(editorA).toContainText(aliceChunk, { timeout: 10000 });
    await expect(editorA).toContainText(bobChunk, { timeout: 10000 });
    await expect(editorB).toContainText(aliceChunk, { timeout: 10000 });
    await expect(editorB).toContainText(bobChunk, { timeout: 10000 });

    // 5. Create a manual version checkpoint (Version Checkpoint v1)
    const historyToggleA = pageA.locator('button[title*="version"]').or(pageA.getByRole('button', { name: /version/i }));
    await historyToggleA.first().click();
    await expect(pageA.locator('aside').filter({ hasText: 'Version History' })).toBeVisible();

    // Click "Checkpoint" button in info banner
    await pageA.locator('aside').getByRole('button', { name: 'Checkpoint' }).click();
    // Fill title and summary
    await pageA.locator('aside input[placeholder*="Checkpoint title"]').fill('Baseline RFC');
    await pageA.locator('aside input[placeholder*="Summary"]').fill('Sprint Milestone Baseline');
    await pageA.locator('aside').getByRole('button', { name: /Save Checkpoint/i }).click();

    // Wait for checkpoint notification in sidebar
    await expect(pageA.locator('aside').getByText('Sprint Milestone Baseline')).toBeVisible({ timeout: 10000 });

    // 6. Make subsequent destructive edits
    await editorA.click();
    await pageA.keyboard.type(' DESTRUCTIVE_TEST_CONTENT_TO_BE_REVERTED ');
    await expect(editorB).toContainText('DESTRUCTIVE_TEST_CONTENT_TO_BE_REVERTED', { timeout: 10000 });

    // Create Checkpoint 2 so Checkpoint 1 is no longer isLatest
    await pageA.locator('aside').getByRole('button', { name: 'Checkpoint' }).click();
    await pageA.locator('aside input[placeholder*="Checkpoint title"]').fill('Destructive Test State');
    await pageA.locator('aside input[placeholder*="Summary"]').fill('Unwanted destructive content');
    await pageA.locator('aside').getByRole('button', { name: /Save Checkpoint/i }).click();
    await expect(pageA.locator('aside').getByText('Unwanted destructive content')).toBeVisible({ timeout: 10000 });

    // 7. Test Disconnect and Reconnect
    // Navigate Page B away to dashboard (simulating disconnect)
    await pageB.goto('http://localhost:3000/dashboard');
    // Page A should see peer count drop to 1 Peer in room
    await expect(pageA.getByText('1 Peer in room')).toBeVisible({ timeout: 10000 });

    // Reconnect User B
    await pageB.goto(`http://localhost:3000/editor/${documentId}`);
    await pageB.waitForSelector('.tiptap', { timeout: 15000 });
    await expect(pageA.getByText('2 Peers in room')).toBeVisible({ timeout: 10000 });
    await expect(pageB.locator('.tiptap')).toContainText('DESTRUCTIVE_TEST_CONTENT_TO_BE_REVERTED');

    // 8. Test Safe Version History Restore
    // User A clicks "Restore" on the baseline checkpoint
    const baselineCard = pageA.locator('aside').locator('div.rounded-xl', { hasText: 'Sprint Milestone Baseline' });
    await baselineCard.getByRole('button', { name: 'Restore' }).click();

    // Confirm restore in modal
    const confirmRestoreBtn = pageA.getByRole('button', { name: /Restore to/i });
    await confirmRestoreBtn.click();

    // Verify on Page A: destructive content is gone
    await expect(pageA.locator('.tiptap')).not.toContainText('DESTRUCTIVE_TEST_CONTENT_TO_BE_REVERTED', { timeout: 10000 });

    // CRITICAL: User B receives the restore live via safe Yjs CRDT differential update!
    await expect(pageB.locator('.tiptap')).not.toContainText('DESTRUCTIVE_TEST_CONTENT_TO_BE_REVERTED', { timeout: 10000 });

    // 9. Verify PostgreSQL durability across full reload
    await pageA.waitForTimeout(2000);
    await pageA.reload();
    await pageA.waitForSelector('.tiptap', { timeout: 15000 });
    await expect(pageA.locator('.tiptap')).not.toContainText('DESTRUCTIVE_TEST_CONTENT_TO_BE_REVERTED');
    await expect(pageA.locator('.tiptap')).toContainText(aliceChunk);

    await contextA.close();
    await contextB.close();
  });
});
