import { test, expect } from '@playwright/test';

test.describe('Homepage Auth-Aware Navigation Verification', () => {
  const timestamp = Date.now();
  const testName = `NavUser ${timestamp}`;
  const testEmail = `nav_user_${timestamp}@collabspace.test`;
  const testPassword = 'Password123!Safe';

  test('1 & 2: While logged out, displays "Sign In" and "Get Started Free"', async ({ page, isMobile }) => {
    // Ensure clean logged-out state
    await page.context().clearCookies();
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    if (isMobile) {
      const hamburger = page.locator('header button[aria-label="Toggle navigation menu"]');
      await expect(hamburger).toBeVisible();
      await hamburger.click();
    }

    // Nav actions
    const signInBtn = page.locator('header').getByRole('link', { name: 'Sign In' });
    const getStartedBtn = page.locator('header').getByRole('link', { name: 'Get Started Free' });
    const openDashBtn = page.locator('header').getByRole('link', { name: 'Open Dashboard' });

    await expect(signInBtn.first()).toBeVisible();
    await expect(signInBtn.first()).toHaveAttribute('href', '/login');

    await expect(getStartedBtn.first()).toBeVisible();
    await expect(getStartedBtn.first()).toHaveAttribute('href', '/signup');

    // "Open Dashboard" must NOT be visible in navbar
    await expect(openDashBtn).toHaveCount(0);
  });

  test('3, 4, 5, 6: Register, sign in, verify "Open Dashboard" and account menu, navigate, logout and verify immediate update', async ({ page, isMobile }) => {
    // 3. Register user
    await page.goto('/signup');
    await page.waitForLoadState('networkidle');

    await page.fill('#fullName', testName);
    await page.fill('#signupEmail', testEmail);
    await page.fill('#signupPassword', testPassword);
    await page.fill('#confirmSignupPassword', testPassword);

    await page.getByRole('button', { name: 'Create Free Account' }).click();

    // Verify redirected to /login
    await expect(page).toHaveURL(/\/login/);

    // Sign in
    await page.fill('#email', testEmail);
    await page.fill('#password', testPassword);
    await page.getByRole('button', { name: /Sign In to CollabSpace/i }).click();

    // Land on dashboard
    await expect(page).toHaveURL(/\/dashboard/);

    // 4. Return to homepage as authenticated user
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    if (isMobile) {
      const hamburger = page.locator('header button[aria-label="Toggle navigation menu"]');
      await expect(hamburger).toBeVisible();
      await hamburger.click();

      // In mobile drawer: "Open Dashboard" is visible, user name is visible
      const openDashBtn = page.locator('header').getByRole('link', { name: 'Open Dashboard' });
      await expect(openDashBtn.first()).toBeVisible();
      await expect(openDashBtn.first()).toHaveAttribute('href', '/dashboard');
      await expect(page.locator('header')).toContainText(testName);

      // 5. Click "Open Dashboard" and verify navigation
      await openDashBtn.first().click();
      await expect(page).toHaveURL(/\/dashboard/);

      // Return to homepage to test logout
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await hamburger.click();

      const signOutBtn = page.locator('header').getByRole('button', { name: /Sign Out/i });
      await expect(signOutBtn).toBeVisible();
      await signOutBtn.click();

      // 6. Navigation updates immediately to show "Sign In" and "Get Started Free"
      await hamburger.click();
      await expect(page.locator('header').getByRole('link', { name: 'Sign In' }).first()).toBeVisible();
      await expect(page.locator('header').getByRole('link', { name: 'Get Started Free' }).first()).toBeVisible();
      await expect(page.locator('header').getByRole('link', { name: 'Open Dashboard' })).toHaveCount(0);
    } else {
      // Desktop: "Sign In" and "Get Started Free" must be hidden in the header
      await expect(page.locator('header').getByRole('link', { name: 'Sign In' })).toHaveCount(0);
      await expect(page.locator('header').getByRole('link', { name: 'Get Started Free' })).toHaveCount(0);

      // "Open Dashboard" must be visible
      const openDashBtn = page.locator('header').getByRole('link', { name: 'Open Dashboard' });
      await expect(openDashBtn.first()).toBeVisible();
      await expect(openDashBtn.first()).toHaveAttribute('href', '/dashboard');

      // Account menu must be visible with user's name
      const userMenuBtn = page.locator('header button[aria-label="User account menu"]');
      await expect(userMenuBtn).toBeVisible();
      await expect(userMenuBtn).toContainText(testName);

      // 5. Click "Open Dashboard" and verify navigation
      await openDashBtn.first().click();
      await expect(page).toHaveURL(/\/dashboard/);

      // Return to homepage to test logout
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Open user account menu and click "Sign Out"
      await page.locator('header button[aria-label="User account menu"]').click();
      const signOutBtn = page.locator('header').getByRole('button', { name: /Sign Out/i });
      await expect(signOutBtn).toBeVisible();
      await signOutBtn.click();

      // 6. Navigation updates immediately to show "Sign In" and "Get Started Free"
      await expect(page.locator('header').getByRole('link', { name: 'Sign In' }).first()).toBeVisible();
      await expect(page.locator('header').getByRole('link', { name: 'Get Started Free' }).first()).toBeVisible();
      await expect(page.locator('header').getByRole('link', { name: 'Open Dashboard' })).toHaveCount(0);
      await expect(page.locator('header button[aria-label="User account menu"]')).toHaveCount(0);
    }
  });

  test('7. Attempt to open /dashboard while logged out redirects to /login', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/dashboard');

    // Must be redirected to /login with callbackUrl
    await expect(page).toHaveURL(/\/login/);
  });
});
