/**
 * End-to-End HTTP API Authentication Test Suite for CollabSpace
 * 
 * Tests real HTTP requests against the running Next.js server on http://localhost:3000
 */

const BASE_URL = 'http://localhost:3000';
const PASS = '✓';
const FAIL = '✗';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ${PASS} ${testName}`);
  } else {
    failedTests++;
    console.error(`  ${FAIL} FAILED: ${testName}${detail ? ` (${detail})` : ''}`);
  }
}

function extractCookie(response: Response, cookieName: string): string | null {
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) return null;
  const match = setCookie.match(new RegExp(`${cookieName}=([^;]+)`));
  return match ? match[1] : null;
}

async function runApiTests() {
  console.log('\n======================================================');
  console.log('   CollabSpace E2E HTTP API Authentication Tests     ');
  console.log('======================================================\n');

  const timestamp = Date.now();
  const testEmail = `e2e_user_${timestamp}@collabspace.test`;
  const testPassword = 'StrongPassword123!';
  const updatedName = 'E2E Tested Engineer';

  let sessionCookie: string | null = null;

  const testIp = `10.200.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200) + 1}`;

  try {
    // 1. Initial unauthenticated /api/auth/me
    console.log('--- 1. Unauthenticated State ---');
    const unauthRes = await fetch(`${BASE_URL}/api/auth/me`);
    const unauthData = await unauthRes.json();
    assert(unauthRes.status === 401, '/api/auth/me returns 401 for unauthenticated requests');
    assert(unauthData.authenticated === false, 'Guest is unauthenticated');
    assert(unauthData.user === null, 'Guest has null user payload');

    // 2. User registration
    console.log('\n--- 2. Registration Flow ---');
    const registerRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
      body: JSON.stringify({
        name: 'E2E User',
        email: testEmail,
        password: testPassword,
        confirmPassword: testPassword,
      }),
    });
    const registerData = await registerRes.json();
    assert(registerRes.status === 201, 'Registration returns 201 Created');
    assert(Boolean(registerData.user?.id), 'Registered user has ID');
    assert(registerData.user?.email === testEmail.toLowerCase(), 'Registered email normalized to lowercase');
    assert(Boolean(registerData.workspace?.id), 'Default workspace created and returned');

    // Check HttpOnly session cookie
    const regSetCookie = registerRes.headers.get('set-cookie');
    assert(Boolean(regSetCookie?.includes('collabspace_session=')), 'Registration issues collabspace_session cookie');
    assert(Boolean(regSetCookie?.toLowerCase().includes('httponly')), 'Session cookie is HttpOnly');
    assert(Boolean(regSetCookie?.toLowerCase().includes('samesite=lax')), 'Session cookie sets SameSite=Lax');
    sessionCookie = extractCookie(registerRes, 'collabspace_session');

    // 3. Duplicate registration rejection
    console.log('\n--- 3. Duplicate Account Prevention ---');
    const dupRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
      body: JSON.stringify({
        name: 'Duplicate Pretender',
        email: testEmail.toUpperCase(), // case variation
        password: testPassword,
        confirmPassword: testPassword,
      }),
    });
    const dupData = await dupRes.json();
    assert(dupRes.status === 409, 'Duplicate email registration returns 409 Conflict');
    assert(Boolean(dupData.error), 'Conflict error message returned');

    // 4. Authenticated /api/auth/me with session cookie
    console.log('\n--- 4. Authenticated Session Verification ---');
    const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Cookie: `collabspace_session=${sessionCookie}` },
    });
    const meData = await meRes.json();
    assert(meRes.status === 200, 'Authenticated /api/auth/me returns 200');
    assert(meData.authenticated === true, 'Session reports authenticated: true');
    assert(meData.user?.email === testEmail.toLowerCase(), 'User profile matches registered email');
    assert(meData.workspaces?.length >= 1, 'Permitted workspaces returned with session');

    // 5. Wrong password login
    console.log('\n--- 5. Login Failures & Anti-Enumeration ---');
    const wrongPassRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'IncorrectPassword999!',
      }),
    });
    const wrongPassData = await wrongPassRes.json();
    assert(wrongPassRes.status === 401, 'Wrong password returns 401 Unauthorized');
    assert(wrongPassData.error === 'Invalid email or password.', 'Generic error message prevents credential leakage');

    // Non-existent user login
    const noUserRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `nonexistent_${timestamp}@example.com`,
        password: 'AnyPassword123!',
      }),
    });
    const noUserData = await noUserRes.json();
    assert(noUserRes.status === 401, 'Non-existent email returns 401 Unauthorized');
    assert(noUserData.error === 'Invalid email or password.', 'Identical generic error prevents account enumeration');

    // 6. Case-insensitive login with UPPERCASE email
    console.log('\n--- 6. Case-Insensitive Email Login ---');
    const upperLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail.toUpperCase(),
        password: testPassword,
      }),
    });
    const upperLoginData = await upperLoginRes.json();
    assert(upperLoginRes.status === 200, 'Uppercase email login returns 200 OK');
    assert(Boolean(upperLoginData.user?.id), 'User returned from case-insensitive login');
    const newSessionCookie = extractCookie(upperLoginRes, 'collabspace_session');
    assert(Boolean(newSessionCookie), 'New session cookie issued on login');

    // 7. Profile update
    console.log('\n--- 7. Profile Update ---');
    const profileRes = await fetch(`${BASE_URL}/api/account/profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `collabspace_session=${newSessionCookie}`,
      },
      body: JSON.stringify({
        name: updatedName,
      }),
    });
    const profileData = await profileRes.json();
    assert(profileRes.status === 200, 'Profile update returns 200 OK');
    assert(profileData.user?.name === updatedName, 'Profile display name updated');

    // 8. Forgot password anti-enumeration
    console.log('\n--- 8. Account Recovery Anti-Enumeration ---');
    const forgotExistingRes = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail }),
    });
    assert(forgotExistingRes.status === 200, 'Forgot password for existing user returns 200');

    const forgotUnknownRes = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `random_unknown_${timestamp}@example.com` }),
    });
    const unknownData = await forgotUnknownRes.json();
    assert(forgotUnknownRes.status === 200, 'Forgot password for unknown user returns 200 (anti-enumeration)');
    assert(
      unknownData.message === 'If an account with that email exists, we have sent recovery instructions.',
      'Safe generic message returned for forgot password regardless of email existence'
    );

    // 9. Logout
    console.log('\n--- 9. Logout Flow ---');
    const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: `collabspace_session=${newSessionCookie}` },
    });
    assert(logoutRes.status === 200, 'Logout returns 200 OK');
    const logoutCookie = logoutRes.headers.get('set-cookie')?.toLowerCase() || '';
    assert(
      logoutCookie.includes('collabspace_session=') && (logoutCookie.includes('max-age=0') || logoutCookie.includes('expires=')),
      'Logout clears collabspace_session cookie'
    );

    // Verify session revoked after logout
    const postLogoutMe = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Cookie: `collabspace_session=${newSessionCookie}` },
    });
    const postLogoutMeData = await postLogoutMe.json();
    assert(postLogoutMeData.authenticated === false, 'Session invalid on server immediately after logout');

    console.log('\n======================================================');
    console.log(`Results: ${passedTests}/${totalTests} tests PASSED (${failedTests} failed)`);
    console.log('======================================================\n');

    if (failedTests > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (error) {
    console.error('Fatal API test error:', error);
    process.exit(1);
  }
}

runApiTests();

export {};
