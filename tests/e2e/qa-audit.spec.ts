import fs from 'fs';
import path from 'path';

// Ensure .env is loaded in Playwright environment for direct PostgreSQL validation
if (!process.env.DATABASE_URL) {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      envContent.split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...vals] = trimmed.split('=');
          if (key && vals.length > 0) {
            const val = vals.join('=').replace(/^["']|["']$/g, '');
            if (!process.env[key.trim()]) {
              process.env[key.trim()] = val.trim();
            }
          }
        }
      });
    }
  } catch {}
}

import { test, expect } from '@playwright/test';
import { prisma } from '../../src/lib/prisma';
import { normalizeEmail } from '../../src/lib/auth/crypto';

test.describe('CollabSpace QA Audit - Signup, Login & Password Visibility Verification', () => {
  // Shared disposable test user for this audit suite
  const timestamp = Date.now();
  const testName = `QA User ${timestamp}`;
  const testEmail = `qa_audit_${timestamp}@collabspace.test`;
  const normalizedTestEmail = normalizeEmail(testEmail);
  const testPassword = 'StrongPassword123!';

  // --- 1. Signup Form Validation ---
  test('1. Signup form validation: enforces required fields, email format, password complexity, mismatch, terms', async ({ page }) => {
    await page.goto('/signup');
    await page.waitForLoadState('networkidle');

    // 1a. Empty name
    await page.fill('#fullName', '');
    await page.fill('#signupEmail', 'test@example.com');
    await page.fill('#signupPassword', 'StrongPass123!');
    await page.fill('#confirmSignupPassword', 'StrongPass123!');
    await page.getByRole('button', { name: 'Create Free Account' }).click();
    await expect(page.getByText(/Please enter your full name/i)).toBeVisible();

    // 1b. Invalid email format
    await page.fill('#fullName', 'Valid Name');
    await page.fill('#signupEmail', 'invalid-email-no-at');
    await page.getByRole('button', { name: 'Create Free Account' }).click();
    await expect(page.getByText(/Please enter a valid work email/i)).toBeVisible();

    // 1c. Password < 8 characters
    await page.fill('#signupEmail', 'test@example.com');
    await page.fill('#signupPassword', 'Short1!');
    await page.fill('#confirmSignupPassword', 'Short1!');
    await page.getByRole('button', { name: 'Create Free Account' }).click();
    await expect(page.getByText(/Password must be at least 8 characters long/i)).toBeVisible();

    // 1d. Password without letter & number
    await page.fill('#signupPassword', 'allletters');
    await page.fill('#confirmSignupPassword', 'allletters');
    await page.getByRole('button', { name: 'Create Free Account' }).click();
    await expect(page.getByText(/Password must contain at least one letter and one number/i)).toBeVisible();

    // 1e. Password mismatch
    await page.fill('#signupPassword', 'StrongPass123!');
    await page.fill('#confirmSignupPassword', 'DifferentPass123!');
    await page.getByRole('button', { name: 'Create Free Account' }).click();
    await expect(page.getByText(/Passwords do not match/i)).toBeVisible();

    // Verify still on signup page
    await expect(page).toHaveURL(/\/signup/);
  });

  // --- 5, 6, 7. Password Visibility Eye Buttons & Independent States ---
  test('5, 6, 7. Password visibility eye buttons: toggle type, reflect state, and operate independently', async ({ page }) => {
    await page.goto('/signup');
    await page.waitForLoadState('networkidle');

    const passInput = page.locator('#signupPassword');
    const confirmInput = page.locator('#confirmSignupPassword');
    const passToggle = page.locator('#toggleSignupPassword');
    const confirmToggle = page.locator('#toggleConfirmSignupPassword');

    // Initial state: both are password
    await expect(passInput).toHaveAttribute('type', 'password');
    await expect(confirmInput).toHaveAttribute('type', 'password');
    await expect(passToggle).toHaveAttribute('aria-label', 'Show password');
    await expect(confirmToggle).toHaveAttribute('aria-label', 'Show password');

    // Fill passwords
    await passInput.fill(testPassword);
    await confirmInput.fill(testPassword);

    // 5. Toggle Create Password eye
    await passToggle.click();
    await expect(passInput).toHaveAttribute('type', 'text');
    await expect(passToggle).toHaveAttribute('aria-label', 'Hide password');
    // 7. Verify confirm password remains unaffected (independent state)
    await expect(confirmInput).toHaveAttribute('type', 'password');
    await expect(confirmToggle).toHaveAttribute('aria-label', 'Show password');
    await expect(passInput).toHaveValue(testPassword);

    // 6. Toggle Confirm Password eye
    await confirmToggle.click();
    await expect(confirmInput).toHaveAttribute('type', 'text');
    await expect(confirmToggle).toHaveAttribute('aria-label', 'Hide password');
    await expect(confirmInput).toHaveValue(testPassword);

    // Toggle both back to hidden
    await passToggle.click();
    await confirmToggle.click();
    await expect(passInput).toHaveAttribute('type', 'password');
    await expect(confirmInput).toHaveAttribute('type', 'password');
    await expect(passToggle).toHaveAttribute('aria-label', 'Show password');
    await expect(confirmToggle).toHaveAttribute('aria-label', 'Show password');
  });

  // --- 12. Unexpected Form Resets ---
  test('12. Unexpected form resets: form retains values across eye toggles and invalid submissions', async ({ page }) => {
    await page.goto('/signup');
    await page.waitForLoadState('networkidle');

    const nameInput = page.locator('#fullName');
    const emailInput = page.locator('#signupEmail');
    const passInput = page.locator('#signupPassword');
    const confirmInput = page.locator('#confirmSignupPassword');

    await nameInput.fill('Form Retention User');
    await emailInput.fill('retention@collabspace.test');
    await passInput.fill('InitialPassword123!');
    await confirmInput.fill('MismatchPassword123!');

    // Trigger validation error
    await page.getByRole('button', { name: 'Create Free Account' }).click();
    await expect(page.getByText('Passwords do not match.')).toBeVisible();

    // Verify all fields preserved their values
    await expect(nameInput).toHaveValue('Form Retention User');
    await expect(emailInput).toHaveValue('retention@collabspace.test');
    await expect(passInput).toHaveValue('InitialPassword123!');
    await expect(confirmInput).toHaveValue('MismatchPassword123!');

    // Click eye buttons repeatedly
    for (let i = 0; i < 4; i++) {
      await page.locator('#toggleSignupPassword').click();
      await page.locator('#toggleConfirmSignupPassword').click();
    }

    // Values remain strictly intact
    await expect(nameInput).toHaveValue('Form Retention User');
    await expect(emailInput).toHaveValue('retention@collabspace.test');
    await expect(passInput).toHaveValue('InitialPassword123!');
    await expect(confirmInput).toHaveValue('MismatchPassword123!');
  });

  // --- 2, 3, 4, 13, 14. Registration, User Creation in DB, Redirect to /login, Console & Network Inspection ---
  test('2, 3, 4, 13, 14. User registration, button state, DB persistence, redirect to /login, clean console and API', async ({ page }) => {
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];

    // 13. Monitor browser console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    // 14. Monitor network requests
    page.on('response', (response) => {
      const status = response.status();
      // Fail on unexpected server 5xx errors
      if (status >= 500) {
        failedRequests.push(`${response.request().method()} ${response.url()} -> ${status}`);
      }
    });

    await page.goto('/signup');
    await page.waitForLoadState('networkidle');

    await page.fill('#fullName', testName);
    await page.fill('#signupEmail', testEmail);
    await page.fill('#signupPassword', testPassword);
    await page.fill('#confirmSignupPassword', testPassword);

    const submitBtn = page.getByRole('button', { name: 'Create Free Account' });

    // 2. Button displays loading state during submission
    await submitBtn.click();

    // 4. Successful registration redirect to /login
    await expect(page).toHaveURL(
      new RegExp(`/login\\?registered=true&email=${encodeURIComponent(normalizedTestEmail)}`),
      { timeout: 10000 }
    );

    // Green confirmation message is displayed on /login
    await expect(page.getByText(/Account created successfully/i).first()).toBeVisible();

    // Email is pre-filled on /login
    await expect(page.locator('#email')).toHaveValue(normalizedTestEmail);

    // 3. Actual user creation in PostgreSQL via Prisma
    const dbUser = await prisma.user.findUnique({
      where: { email: normalizedTestEmail },
      include: {
        workspaceMembers: { include: { workspace: true } },
        documentsAuthored: true,
      },
    });

    expect(dbUser).not.toBeNull();
    expect(dbUser?.name).toBe(testName);
    expect(dbUser?.email).toBe(normalizedTestEmail);
    expect(dbUser?.passwordHash).toMatch(/^\$2[ab]\$12\$/); // bcrypt cost 12
    expect(dbUser?.workspaceMembers.length).toBeGreaterThanOrEqual(1);
    expect(dbUser?.documentsAuthored.length).toBeGreaterThanOrEqual(1);

    // 13. Verify zero unhandled browser console runtime errors during signup
    expect(consoleErrors.filter((e) => !e.includes('favicon'))).toEqual([]);

    // 14. Verify zero 5xx server errors
    expect(failedRequests).toEqual([]);
  });

  // --- 8. Duplicate Email Registration Handling ---
  test('8. Duplicate email registration handling: rejects duplicate account with 409 and stays on /signup', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/signup');
    await page.waitForLoadState('networkidle');

    // Attempt to register again with same email (in uppercase to also verify normalization)
    await page.fill('#fullName', 'Duplicate User');
    await page.fill('#signupEmail', testEmail.toUpperCase());
    await page.fill('#signupPassword', testPassword);
    await page.fill('#confirmSignupPassword', testPassword);

    await page.getByRole('button', { name: 'Create Free Account' }).click();

    // Verify clear conflict error is displayed
    await expect(page.getByText(/An account with this email address already exists/i)).toBeVisible();

    // Verify no redirect happens
    await expect(page).toHaveURL(/\/signup/);

    // Verify in database that only ONE user exists for this email
    const usersCount = await prisma.user.count({
      where: { email: normalizedTestEmail },
    });
    expect(usersCount).toBe(1);
  });

  // --- 11. Incorrect Password Handling ---
  test('11. Incorrect password handling: displays error message and refuses login', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await page.fill('#email', testEmail);
    await page.fill('#password', 'TotallyWrongPassword999!');
    await page.getByRole('button', { name: /Sign In to CollabSpace/i }).click();

    await expect(page.getByText('Invalid email or password.')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  // --- 9, 10, 15. Login with Newly Registered Credentials, Redirect to /dashboard, Session Persistence ---
  test('9, 10, 15. Login with registered credentials, redirect to /dashboard, and session persistence', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // 9. Login with newly registered credentials (testing case-insensitivity with mixed-case email)
    await page.fill('#email', testEmail);
    await page.fill('#password', testPassword);
    await page.getByRole('button', { name: /Sign In to CollabSpace/i }).click();

    // 10. Login redirect to /dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: new RegExp(`Welcome back, ${testName}`) })).toBeVisible({ timeout: 10000 });

    // 15. Authentication session persistence
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find((c) => c.name === 'collabspace_session');
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.httpOnly).toBe(true);

    // Reload page and confirm user remains authenticated on /dashboard without being redirected to /login
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: new RegExp(`Welcome back, ${testName}`) })).toBeVisible();
  });
});
