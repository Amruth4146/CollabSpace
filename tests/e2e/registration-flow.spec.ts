import { test, expect } from '@playwright/test';

test.describe('Comprehensive Registration & Password Visibility Suite', () => {
  test('Test Cases 4, 5, 6: Password eye icons toggle visibility independently and preserve form state', async ({ page }) => {
    await page.goto('/signup');
    await page.waitForLoadState('networkidle');

    const passInput = page.locator('#signupPassword');
    const confirmInput = page.locator('#confirmSignupPassword');
    const passToggle = page.locator('#toggleSignupPassword');
    const confirmToggle = page.locator('#toggleConfirmSignupPassword');

    // Initial state: both are password type
    await expect(passInput).toHaveAttribute('type', 'password');
    await expect(confirmInput).toHaveAttribute('type', 'password');

    // Fill sample passwords
    await passInput.fill('SecretPass123!');
    await confirmInput.fill('SecretPass123!');

    // Test Case 4: Toggle Create Password visibility
    await passToggle.click();
    await expect(passInput).toHaveAttribute('type', 'text');
    await expect(confirmInput).toHaveAttribute('type', 'password'); // Test Case 5: independent
    await expect(passInput).toHaveValue('SecretPass123!'); // Preserves value

    // Toggle Create Password back to hidden
    await passToggle.click();
    await expect(passInput).toHaveAttribute('type', 'password');
    await expect(passInput).toHaveValue('SecretPass123!');

    // Test Case 5: Toggle Confirm Password visibility independently
    await confirmToggle.click();
    await expect(confirmInput).toHaveAttribute('type', 'text');
    await expect(passInput).toHaveAttribute('type', 'password'); // create password remains hidden
    await expect(confirmInput).toHaveValue('SecretPass123!');

    // Test Case 6: Repeated toggles do not submit form, reset inputs, or navigate
    for (let i = 0; i < 5; i++) {
      await passToggle.click();
      await confirmToggle.click();
    }
    // Still on /signup and passwords intact
    await expect(page).toHaveURL(/\/signup/);
    await expect(passInput).toHaveValue('SecretPass123!');
    await expect(confirmInput).toHaveValue('SecretPass123!');
  });

  test('Test Cases 3, 10: Validation on mismatched passwords and failed registration (no redirect)', async ({ page }) => {
    await page.goto('/signup');
    await page.waitForLoadState('networkidle');

    // Test Case 3: Mismatched passwords
    await page.fill('#fullName', 'Sarah Chen');
    await page.fill('#signupEmail', 'sarah.chen@collabspace.test');
    await page.fill('#signupPassword', 'StrongPass123!');
    await page.fill('#confirmSignupPassword', 'DifferentPass123!');
    await page.getByRole('button', { name: 'Create Free Account' }).click();

    // Shows validation error and does NOT redirect
    await expect(page.getByText('Passwords do not match.')).toBeVisible();
    await expect(page).toHaveURL(/\/signup/);

    // Test Case 10: Server error simulation or invalid input
    await page.fill('#signupPassword', 'short');
    await page.fill('#confirmSignupPassword', 'short');
    await page.getByRole('button', { name: 'Create Free Account' }).click();

    await expect(page.getByText('Password must be at least 8 characters long.')).toBeVisible();
    await expect(page).toHaveURL(/\/signup/);
  });

  test('Test Cases 1, 2, 7, 8, 9: Full registration, login redirect, wrong password, case-insensitive sign-in, and duplicate rejection', async ({ page }) => {
    const timestamp = Date.now();
    const testName = `User ${timestamp}`;
    const testEmail = `Registered_User_${timestamp}@CollabSpace.Test`;
    const testPassword = 'SecurePassword123!';

    // --- Test Case 1: Register a new user with valid details ---
    await page.goto('/signup');
    await page.waitForLoadState('networkidle');

    await page.fill('#fullName', testName);
    await page.fill('#signupEmail', testEmail);
    await page.fill('#signupPassword', testPassword);
    await page.fill('#confirmSignupPassword', testPassword);

    await page.getByRole('button', { name: 'Create Free Account' }).click();

    // Verify redirected to /login with registered status
    await expect(page).toHaveURL(new RegExp(`/login\\?registered=true&email=${encodeURIComponent(testEmail.toLowerCase())}`), { timeout: 10000 });

    // Success message displayed on /login
    await expect(page.getByText(/Account created successfully/i).first()).toBeVisible();

    // Email pre-filled with normalized lowercase email
    await expect(page.locator('#email')).toHaveValue(testEmail.toLowerCase());

    // --- Test Case 8: Enter an incorrect password ---
    await page.fill('#password', 'WrongPassword123!');
    await page.getByRole('button', { name: /Sign In to CollabSpace/i }).click();

    await expect(page.getByText('Invalid email or password.')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    // --- Test Case 9 & 7: Sign in with different letter casing (case-insensitive) & redirect to /dashboard ---
    await page.fill('#email', testEmail.toUpperCase()); // UPPERCASE email
    await page.fill('#password', testPassword);
    await page.getByRole('button', { name: /Sign In to CollabSpace/i }).click();

    // Redirected to /dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: new RegExp(`Welcome back, ${testName}`) })).toBeVisible({ timeout: 10000 });

    // --- Test Case 2: Register using an existing email (Conflict rejection) ---
    // Clear cookies to simulate a new visitor
    await page.context().clearCookies();
    await page.goto('/signup');
    await page.waitForLoadState('networkidle');

    await page.fill('#fullName', 'Another Person');
    await page.fill('#signupEmail', testEmail.toLowerCase());
    await page.fill('#signupPassword', testPassword);
    await page.fill('#confirmSignupPassword', testPassword);

    await page.getByRole('button', { name: 'Create Free Account' }).click();

    await expect(page.getByText(/already exists/i)).toBeVisible();
    await expect(page).toHaveURL(/\/signup/);
  });
});
