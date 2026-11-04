import { test, expect } from '@playwright/test';
import { getRedisClient } from '../../src/lib/redis';
import { prisma } from '../../src/lib/prisma';

test.describe('Real-Time Multi-User Comments System E2E (Editor, Commenter, Viewer)', () => {
  test.beforeEach(async () => {
    // Clear rate limits before tests
    try {
      const redis = getRedisClient();
      const keys = await redis.keys('ratelimit:*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      await prisma.rateLimitRecord.deleteMany();
    } catch {}
  });

  test('Editor, Commenter, and Viewer collaborate with real-time comments, replies, resolves, and RBAC', async ({ browser }) => {
    const timestamp = Date.now();
    const userA_Name = `Alice ${timestamp}`;
    const userA_Email = `alice_comments_${timestamp}@collabspace.test`;
    const userB_Name = `Bob ${timestamp}`;
    const userB_Email = `bob_comments_${timestamp}@collabspace.test`;
    const userC_Name = `Charlie ${timestamp}`;
    const userC_Email = `charlie_comments_${timestamp}@collabspace.test`;
    const password = 'Password123!Safe';

    // -------------------------------------------------------------
    // 1. Setup User A (Editor / Owner)
    // -------------------------------------------------------------
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
    expect(docsData.documents.length).toBeGreaterThan(0);
    const documentId = docsData.documents[0].id;

    // -------------------------------------------------------------
    // 2. Setup User B (Commenter)
    // -------------------------------------------------------------
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
      data: {
        email: userB_Email,
        role: 'commenter',
      },
    });
    expect(inviteB.ok()).toBe(true);

    // -------------------------------------------------------------
    // 3. Setup User C (Viewer)
    // -------------------------------------------------------------
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
      data: {
        email: userC_Email,
        role: 'viewer',
      },
    });
    expect(inviteC.ok()).toBe(true);

    // -------------------------------------------------------------
    // 4. Open Document in all 3 sessions
    // -------------------------------------------------------------
    await pageA.goto(`http://localhost:3000/editor/${documentId}`);
    await pageB.goto(`http://localhost:3000/editor/${documentId}`);
    await pageC.goto(`http://localhost:3000/editor/${documentId}`);

    await pageA.waitForSelector('.tiptap', { timeout: 15000 });
    await pageB.waitForSelector('.tiptap', { timeout: 15000 });
    await pageC.waitForSelector('.tiptap', { timeout: 15000 });

    // Open Comments sidebar on Page A & Page B & Page C
    // In EditorHeader: button with "Comments" title or icon
    const commentsToggleBtnA = pageA.locator('button[title*="Comments"]').or(pageA.getByRole('button', { name: /Comments/i }));
    await commentsToggleBtnA.first().click();
    await expect(pageA.locator('aside').filter({ hasText: 'Comments' })).toBeVisible();

    const commentsToggleBtnB = pageB.locator('button[title*="Comments"]').or(pageB.getByRole('button', { name: /Comments/i }));
    await commentsToggleBtnB.first().click();
    await expect(pageB.locator('aside').filter({ hasText: 'Comments' })).toBeVisible();

    const commentsToggleBtnC = pageC.locator('button[title*="Comments"]').or(pageC.getByRole('button', { name: /Comments/i }));
    await commentsToggleBtnC.first().click();
    await expect(pageC.locator('aside').filter({ hasText: 'Comments' })).toBeVisible();

    // -------------------------------------------------------------
    // 5. User A posts a root comment
    // -------------------------------------------------------------
    const commentInputA = pageA.locator('input[placeholder*="comment"]').first();
    await commentInputA.fill('Architecture team: Please check sprint timelines.');
    await pageA.getByRole('button', { name: 'Post' }).click();

    // Verify comment appears on Page A
    await expect(pageA.locator('aside').getByText('Architecture team: Please check sprint timelines.')).toBeVisible({
      timeout: 10000,
    });

    // -------------------------------------------------------------
    // 6. User B receives the comment in real time (No page refresh!)
    // -------------------------------------------------------------
    await expect(pageB.locator('aside').getByText('Architecture team: Please check sprint timelines.')).toBeVisible({
      timeout: 10000,
    });

    // -------------------------------------------------------------
    // 7. User B (Commenter) posts a threaded reply
    // -------------------------------------------------------------
    const replyInputB = pageB.locator('input[placeholder*="Reply"]').first();
    await replyInputB.fill('Reviewed: All backend milestones align with Q4 roadmap.');
    await pageB.getByRole('button', { name: 'Reply' }).first().click();

    // Verify reply visible on Page B
    await expect(pageB.locator('aside').getByText('Reviewed: All backend milestones align with Q4 roadmap.')).toBeVisible({
      timeout: 10000,
    });

    // Verify User A receives reply in real time without refreshing
    await expect(pageA.locator('aside').getByText('Reviewed: All backend milestones align with Q4 roadmap.')).toBeVisible({
      timeout: 10000,
    });

    // -------------------------------------------------------------
    // 8. User A resolves the thread
    // -------------------------------------------------------------
    const resolveBtnA = pageA.locator('button[title="Mark as resolved"]').first();
    await resolveBtnA.click();

    // Verify tab count updates to Open (0) and Resolved (1)
    await expect(pageA.getByRole('button', { name: /Resolved \(1\)/i })).toBeVisible({ timeout: 10000 });

    // Check Resolved tab on Page A
    await pageA.getByRole('button', { name: /Resolved \(1\)/i }).click();
    await expect(pageA.locator('aside').getByText('Architecture team: Please check sprint timelines.')).toBeVisible();

    // Verify User B sees it in Resolved tab in real time without refreshing
    await expect(pageB.getByRole('button', { name: /Resolved \(1\)/i })).toBeVisible({ timeout: 10000 });
    await pageB.getByRole('button', { name: /Resolved \(1\)/i }).click();
    await expect(pageB.locator('aside').getByText('Architecture team: Please check sprint timelines.')).toBeVisible();

    // -------------------------------------------------------------
    // 9. User C (Viewer) checks comments sidebar (RBAC verification)
    // -------------------------------------------------------------
    // Viewer should see the read-only notice
    await expect(pageC.locator('aside').getByText(/Viewer role: You have read-only access to comments/i)).toBeVisible();
    // Viewer should NOT have a "Post" button
    await expect(pageC.locator('aside').getByRole('button', { name: 'Post' })).not.toBeVisible();

    // Clean up browser contexts
    await contextA.close();
    await contextB.close();
    await contextC.close();
  });
});
