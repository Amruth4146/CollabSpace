/**
 * CollabSpace Registration & Authentication Flow Integration Test Suite
 * 
 * Tests:
 * 1. Input validation error handling (short name, invalid email, short password, mismatched password)
 * 2. Secure registration with bcrypt cost 12 password hashing
 * 3. PostgreSQL persistence verification via Prisma
 * 4. Workspace and welcome document provisioning in transaction
 * 5. Clean redirect state without unintended auto-login (autoLogin: false)
 * 6. Duplicate email prevention (409 Conflict)
 * 7. Failed sign-in with incorrect password
 * 8. Successful sign-in with registered credentials (case-insensitive email)
 * 9. Authenticated session verification (/api/auth/me)
 */

import { prisma } from '../src/lib/prisma';
import { normalizeEmail } from '../src/lib/auth/crypto';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ❌ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function run() {
  console.log('======================================================');
  console.log('   CollabSpace Registration & Sign-In Test Suite      ');
  console.log('======================================================\n');

  const timestamp = Date.now();
  const testName = 'Alex Rivera';
  const rawEmail = `Alex.Rivera_${timestamp}@CollabSpace.Test`;
  const normalizedEmail = normalizeEmail(rawEmail);
  const testPassword = 'StrongPassword123!';

  const testIp = `10.99.1.${Math.floor(Math.random() * 200) + 1}`;

  // --- Step 1: Input Validation Tests ---
  console.log('--- 1. Input Validation Tests ---');

  // Short name
  const resShortName = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
    body: JSON.stringify({
      name: 'A',
      email: rawEmail,
      password: testPassword,
      confirmPassword: testPassword,
    }),
  });
  assert(resShortName.status === 400, 'Rejects name shorter than 2 characters (400)');

  // Invalid email
  const resInvalidEmail = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
    body: JSON.stringify({
      name: testName,
      email: 'not-an-email',
      password: testPassword,
      confirmPassword: testPassword,
    }),
  });
  assert(resInvalidEmail.status === 400, 'Rejects invalid email format (400)');

  // Short password
  const resShortPass = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
    body: JSON.stringify({
      name: testName,
      email: rawEmail,
      password: 'short',
      confirmPassword: 'short',
    }),
  });
  assert(resShortPass.status === 400, 'Rejects password shorter than 8 characters (400)');

  // Mismatched passwords
  const resMismatch = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
    body: JSON.stringify({
      name: testName,
      email: rawEmail,
      password: testPassword,
      confirmPassword: 'DifferentPassword123!',
    }),
  });
  assert(resMismatch.status === 400, 'Rejects mismatched passwords (400)');

  // --- Step 2: Valid Registration ---
  console.log('\n--- 2. Valid Registration Request ---');
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
    body: JSON.stringify({
      name: testName,
      email: rawEmail,
      password: testPassword,
      confirmPassword: testPassword,
      autoLogin: false,
    }),
  });

  const regData = await regRes.json();
  assert(regRes.status === 201, 'Registration returns 201 Created');
  assert(regData.success === true, 'Response payload reports success: true');
  assert(Boolean(regData.user?.id), 'Created user has valid UUID');
  assert(regData.user.email === normalizedEmail, 'User email normalized to lowercase');
  assert(Boolean(regData.workspace?.id), 'Default workspace created and returned');

  // Verify that autoLogin: false did NOT issue a session cookie
  const setCookie = regRes.headers.get('set-cookie') || '';
  const hasActiveSession = setCookie.includes('collabspace_session=') && !setCookie.includes('collabspace_session=;');
  assert(!hasActiveSession, 'Registration with autoLogin: false does not leave active session');

  // --- Step 3: PostgreSQL Database Persistence Verification ---
  console.log('\n--- 3. PostgreSQL Database Persistence ---');
  const dbUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: {
      workspaceMembers: {
        include: { workspace: true },
      },
      documentsAuthored: true,
    },
  });

  assert(Boolean(dbUser), 'User record exists in PostgreSQL database');
  assert(dbUser!.name === testName, 'User name matches in database');
  assert(dbUser!.email === normalizedEmail, 'Email stored in normalized form in database');
  assert(
    dbUser!.passwordHash.startsWith('$2a$12$') || dbUser!.passwordHash.startsWith('$2b$12$'),
    'Password stored as bcrypt hash with cost factor 12'
  );
  assert(dbUser!.passwordHash !== testPassword, 'Plaintext password is never stored in database');
  assert(dbUser!.workspaceMembers.length >= 1, 'Default workspace membership created in database');
  assert(dbUser!.workspaceMembers[0].role === 'owner', 'User assigned owner role in default workspace');
  assert(dbUser!.documentsAuthored.length >= 1, 'Welcome starter document created in database');

  // --- Step 4: Duplicate Email Prevention ---
  console.log('\n--- 4. Duplicate Email Registration Prevention ---');
  const dupRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
    body: JSON.stringify({
      name: 'Another User',
      email: rawEmail.toUpperCase(), // Same normalized email, uppercase
      password: testPassword,
      confirmPassword: testPassword,
      autoLogin: false,
    }),
  });

  const dupData = await dupRes.json();
  assert(dupRes.status === 409, 'Duplicate normalized email returns 409 Conflict');
  assert(
    dupData.error?.includes('already exists'),
    'Conflict message advises user account already exists'
  );

  // --- Step 5: Sign In with Incorrect Password ---
  console.log('\n--- 5. Sign In with Incorrect Password ---');
  const wrongLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: rawEmail,
      password: 'WrongPassword999!',
    }),
  });

  assert(wrongLoginRes.status === 401, 'Wrong password returns 401 Unauthorized');
  const wrongLoginData = await wrongLoginRes.json();
  assert(wrongLoginData.error === 'Invalid email or password.', 'Generic anti-enumeration error message returned');

  // --- Step 6: Sign In with Registered Account ---
  console.log('\n--- 6. Sign In with Registered Account ---');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: rawEmail, // Tests case-insensitive email lookup
      password: testPassword,
      rememberMe: true,
    }),
  });

  const loginData = await loginRes.json();
  assert(loginRes.status === 200, 'Login succeeds with 200 OK');
  assert(loginData.success === true, 'Login reports success: true');
  assert(loginData.user.id === dbUser!.id, 'Logged in user ID matches registered PostgreSQL user');

  const loginSetCookie = loginRes.headers.get('set-cookie');
  assert(Boolean(loginSetCookie?.includes('collabspace_session=')), 'Login issues collabspace_session cookie');
  assert(Boolean(loginSetCookie?.toLowerCase().includes('httponly')), 'Session cookie is HttpOnly');

  // Extract session cookie token
  const sessionTokenMatch = loginSetCookie?.match(/collabspace_session=([^;]+)/);
  const sessionToken = sessionTokenMatch ? sessionTokenMatch[1] : '';
  assert(Boolean(sessionToken), 'Extracted session token from cookie');

  // --- Step 7: Authenticated Session & Dashboard Access ---
  console.log('\n--- 7. Authenticated Session & Dashboard Verification ---');
  const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: {
      Cookie: `collabspace_session=${sessionToken}`,
    },
  });

  const meData = await meRes.json();
  assert(meRes.status === 200, '/api/auth/me returns 200 with session cookie');
  assert(meData.authenticated === true, 'Session is authenticated: true');
  assert(meData.user.id === dbUser!.id, 'Session user matches registered user');
  assert(meData.workspaces.length >= 1, 'User default workspace accessible for dashboard');

  // Cleanup test user
  console.log('\n--- Cleaning up test records ---');
  await prisma.user.delete({ where: { id: dbUser!.id } });
  console.log('Test records safely removed.');

  console.log('\n======================================================');
  console.log('Results: All registration and login tests PASSED!     ');
  console.log('======================================================');
}

run()
  .catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
