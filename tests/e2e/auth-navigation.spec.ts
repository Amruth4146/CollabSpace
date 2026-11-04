import { test, expect } from '@playwright/test';

test.describe('CollabSpace Navigation & Authentication Flow', () => {
  test('landing page renders hero, navigation, and key branding elements', async ({ page, isMobile }) => {
    await page.goto('/');

    // Check title and hero text
    await expect(page).toHaveTitle(/CollabSpace/i);
    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible();
    await expect(heading).toContainText(/ideas/i);

    // Check navigation brand logo
    const brand = page.locator('header a[href="/"]').first();
    await expect(brand).toBeVisible();

    // Check desktop sign-in button if desktop
    if (!isMobile) {
      const loginLink = page.locator('header a[href="/login"]').first();
      await expect(loginLink).toBeVisible();
      await expect(loginLink).toContainText(/sign in/i);
    }

    // Check CTA button
    const getStartedBtn = page.locator('text=Start Creating Free').first();
    await expect(getStartedBtn).toBeVisible();
  });

  test('protected routes redirect unauthenticated users to login with callbackUrl', async ({ page }) => {
    // Attempt to access protected dashboard directly
    await page.goto('/dashboard');

    // Should redirect to /login?callbackUrl=/dashboard
    await page.waitForURL(/\/login/);
    expect(page.url()).toContain('/login');
    expect(page.url()).toContain('callbackUrl=%2Fdashboard');

    // Attempt to access protected editor directly
    await page.goto('/editor/test-doc-123');
    await page.waitForURL(/\/login/);
    expect(page.url()).toContain('/login');
    expect(page.url()).toContain('callbackUrl=%2Feditor%2Ftest-doc-123');
  });

  test('login page validates credentials and displays anti-enumeration error messages', async ({ page }) => {
    await page.goto('/login');

    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    const submitBtn = page.getByRole('button', { name: /sign in/i });

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    // Submit non-existent credentials to verify API error handling & anti-enumeration
    await emailInput.fill('unknown.user@collabspace.dev');
    await passwordInput.fill('WrongPassword123!');
    await submitBtn.click();

    // Check server rejection message (anti-enumeration generic error)
    const serverError = page.locator('text=Invalid email or password');
    await expect(serverError).toBeVisible({ timeout: 10000 });
  });

  test('mobile responsiveness viewport displays adapted navigation and clean layout', async ({ page }) => {
    // Set viewport to mobile dimensions (390 x 844)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    // Check mobile layout has no horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const windowWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(windowWidth + 2);

    // Check mobile brand logo is visible
    const brand = page.locator('header a[href="/"]').first();
    await expect(brand).toBeVisible();
  });
});
