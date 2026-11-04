import { test, expect } from '@playwright/test';

test.describe('Document Editor & Collaboration UI E2E', () => {
  test.beforeEach(async ({ context }) => {
    // Inject valid session cookie so middleware grants access to protected /editor routes
    await context.addCookies([
      {
        name: 'collabspace_session',
        value: 'mock_session_token_for_e2e_testing',
        domain: '127.0.0.1',
        path: '/',
      },
    ]);
  });

  test('demo document editor loads with rich text toolbar and document metadata', async ({ page }) => {
    await page.goto('/editor/doc-prd-sync');

    // Wait for document title input to load
    const titleInput = page.locator('input[value*="Product Requirements"]');
    await expect(titleInput).toBeVisible({ timeout: 15000 });

    // Verify rich-text editor element is visible
    const editor = page.locator('.tiptap, [contenteditable="true"]').first();
    await expect(editor).toBeVisible();

    // Verify workspace breadcrumb
    await expect(page.locator('text=Acme Product Team').first()).toBeVisible();
  });

  test('keyboard shortcuts modal opens, displays shortcuts, and closes via Escape key', async ({ page }) => {
    await page.goto('/editor/doc-prd-sync');
    await page.waitForSelector('input[value*="Product Requirements"]', { timeout: 15000 });

    // Trigger keyboard shortcuts modal via Ctrl+/ keyboard shortcut
    await page.keyboard.press('Control+/');

    // Verify accessible dialog opens
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog).toHaveAttribute('aria-modal', 'true');

    // Verify heading specifically by role to avoid strict mode collisions
    const shortcutsHeading = page.getByRole('heading', { name: 'Keyboard Shortcuts' });
    await expect(shortcutsHeading).toBeVisible();

    // Verify shortcut categories
    await expect(page.locator('text=Bold')).toBeVisible();
    await expect(page.locator('text=Heading 1')).toBeVisible();

    // Press Escape to dismiss dialog
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });

  test('version history sidebar toggles and shows snapshot timeline', async ({ page }) => {
    await page.goto('/editor/doc-prd-sync');
    await page.waitForSelector('input[value*="Product Requirements"]', { timeout: 15000 });

    // Find and click Version History button using aria-label
    const historyBtn = page.locator('button[aria-label="Toggle version history"]');
    await expect(historyBtn).toBeVisible();
    await historyBtn.click();

    // History panel should open
    const historyTitle = page.locator('text=Version History');
    await expect(historyTitle).toBeVisible();

    // Click close button on history panel using aria-label
    const closeHistoryBtn = page.locator('button[aria-label="Close history"]');
    await expect(closeHistoryBtn).toBeVisible();
    await closeHistoryBtn.click();
    await expect(historyTitle).not.toBeVisible();
  });

  test('comments drawer toggles smoothly', async ({ page }) => {
    await page.goto('/editor/doc-prd-sync');
    await page.waitForSelector('input[value*="Product Requirements"]', { timeout: 15000 });

    // Find and click Comments button using aria-label
    const commentsBtn = page.locator('button[aria-label="Toggle comments"]');
    await expect(commentsBtn).toBeVisible();
    await commentsBtn.click();

    // Comments drawer should open
    const commentsHeading = page.locator('h3:has-text("Comments")');
    await expect(commentsHeading).toBeVisible();
  });
});
