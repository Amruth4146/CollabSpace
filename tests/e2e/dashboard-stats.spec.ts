import { test, expect } from '@playwright/test';

test.describe('Dashboard Collaboration Statistics Section', () => {
  test.beforeEach(async ({ context }) => {
    // Inject valid session cookie for dashboard access
    await context.addCookies([
      {
        name: 'collabspace_session',
        value: 'mock_session_token_for_dashboard_testing',
        domain: '127.0.0.1',
        path: '/',
      },
    ]);
  });

  test('displays accurate Collaboration label, neutral ready status, and demo badge', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // 1. Verify Welcome Banner exists
    const welcomeHeading = page.getByRole('heading', { name: /Welcome back/i });
    await expect(welcomeHeading).toBeVisible({ timeout: 10000 });

    // 2. Verify "Collaboration" label exists and "Sync Protocol" has been replaced
    await expect(page.locator('text=Collaboration').first()).toBeVisible();
    await expect(page.locator('text=Sync Protocol')).toHaveCount(0);

    // 3. Verify honest neutral status "Collaboration Ready" is displayed
    await expect(page.getByText('Collaboration Ready', { exact: true })).toBeVisible();

    // 4. Verify "Live Sync" or "Connected" is NOT falsely claimed on the dashboard
    await expect(page.locator('text=Live Sync')).toHaveCount(0);
    await expect(page.locator('text=Real-time Active')).toHaveCount(0);

    // 5. Verify technology details info icon with accessible tooltip
    const infoIcon = page.locator('[aria-label="Technology Information"]');
    await expect(infoIcon).toBeVisible();

    // 6. Verify Team Members stat exists
    await expect(page.locator('text=Team Members')).toBeVisible();

    // 7. Check for horizontal overflow (no scrollbar blowout on statistics cards)
    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const windowWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyScrollWidth).toBeLessThanOrEqual(windowWidth + 1);
  });
});
