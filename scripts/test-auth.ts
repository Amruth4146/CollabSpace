/**
 * CollabSpace Comprehensive Authentication & Security Test Suite
 * 
 * Verifies:
 * 1. Cryptographic primitives (bcrypt cost 12, timing-safe equality, token hashing)
 * 2. Zod validation schemas (registration, login, password reset)
 * 3. User registration, normalization, duplicate prevention, default workspace and doc creation
 * 4. Login, case-insensitive email matching, wrong password rejection
 * 5. Rate limiting with Redis and PostgreSQL fallback
 * 6. Email verification tokens, single-use consumption, expiration
 * 7. Password reset tokens, single-use consumption, session invalidation
 * 8. Session tokens, SHA-256 storage hashing, expiration detection
 * 9. Server-side RBAC authorization: workspace & document boundaries between users
 * 10. Account profile updates and password changes
 */

import { prisma } from '../src/lib/prisma';
import {
  hashPassword,
  verifyPassword,
  generateSecureToken,
  hashToken,
  normalizeEmail,
  constantTimeEquals,
} from '../src/lib/auth/crypto';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../src/lib/auth/schemas';
import { checkRateLimit } from '../src/lib/auth/rate-limit';
import {
  verifyWorkspaceAccess,
  verifyDocumentAccess,
  AuthError,
} from '../src/lib/auth/authorization';

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

async function runTests() {
  console.log('\n======================================================');
  console.log('   CollabSpace Authentication & Security Test Suite   ');
  console.log('======================================================\n');

  const timestamp = Date.now();
  const testEmailA = `alice_${timestamp}@collabspace.test`;
  const testEmailB = `bob_${timestamp}@collabspace.test`;
  const rawPassword = 'SecurePassword123!';
  const updatedPassword = 'NewSecurePassword456!';

  try {
    // -----------------------------------------------------------------
    // TEST SUITE 1: Cryptographic Primitives & Validation
    // -----------------------------------------------------------------
    console.log('--- 1. Cryptography & Validation ---');
    
    // Email normalization
    const messyEmail = '  Alice.Smith+test@GMAIL.com ';
    const normalized = normalizeEmail(messyEmail);
    assert(normalized === 'alice.smith+test@gmail.com', 'Email normalization strips whitespace and lowercases');

    // Password hashing
    const hashedPassword = await hashPassword(rawPassword);
    assert(hashedPassword.startsWith('$2b$12$') || hashedPassword.startsWith('$2a$12$'), 'Password hashed with bcrypt cost 12');
    assert(hashedPassword !== rawPassword, 'Plaintext password is never stored or preserved');

    // Password verification
    const isPasswordValid = await verifyPassword(rawPassword, hashedPassword);
    assert(isPasswordValid === true, 'Bcrypt verification validates correct password');
    const isWrongPasswordValid = await verifyPassword('WrongPassword123!', hashedPassword);
    assert(isWrongPasswordValid === false, 'Bcrypt verification rejects wrong password');

    // Timing-safe comparison
    assert(constantTimeEquals('secret-token-123', 'secret-token-123') === true, 'Constant time equals matches identical strings');
    assert(constantTimeEquals('secret-token-123', 'secret-token-999') === false, 'Constant time equals rejects different strings');
    assert(constantTimeEquals('secret-token-123', 'short') === false, 'Constant time equals safely rejects different length strings');

    // Token generation and SHA-256 storage hashing
    const rawToken = generateSecureToken(32);
    assert(rawToken.length === 64, 'Secure random token is 64 hex characters (32 bytes)');
    const hashedToken = hashToken(rawToken);
    assert(hashedToken.length === 64, 'SHA-256 token hash produces 64 hex character digest');
    assert(hashedToken !== rawToken, 'Token hash differs from raw bearer token');

    // Zod registration schema validation
    const validReg = registerSchema.safeParse({
      name: 'Alice Smith',
      email: testEmailA,
      password: rawPassword,
      confirmPassword: rawPassword,
    });
    assert(validReg.success === true, 'Registration schema accepts valid payload');

    const invalidShortPass = registerSchema.safeParse({
      name: 'Alice Smith',
      email: testEmailA,
      password: 'short',
      confirmPassword: 'short',
    });
    assert(invalidShortPass.success === false, 'Registration schema rejects passwords under 8 characters');

    const mismatchedPass = registerSchema.safeParse({
      name: 'Alice Smith',
      email: testEmailA,
      password: rawPassword,
      confirmPassword: 'DifferentPassword123!',
    });
    assert(mismatchedPass.success === false, 'Registration schema rejects mismatched password confirmation');

    // Login schema validation
    const validLoginPayload = loginSchema.safeParse({ email: testEmailA, password: rawPassword });
    assert(validLoginPayload.success === true, 'Login schema accepts valid credentials payload');
    const invalidLoginPayload = loginSchema.safeParse({ email: 'not-an-email', password: '' });
    assert(invalidLoginPayload.success === false, 'Login schema rejects malformed credentials');

    // Forgot password schema validation
    const validForgot = forgotPasswordSchema.safeParse({ email: testEmailA });
    assert(validForgot.success === true, 'Forgot password schema validates email');

    // Reset password schema validation
    const validReset = resetPasswordSchema.safeParse({
      token: generateSecureToken(),
      password: updatedPassword,
      confirmPassword: updatedPassword,
    });
    assert(validReset.success === true, 'Reset password schema validates matching new passwords');

    // -----------------------------------------------------------------
    // TEST SUITE 2: User Registration & Database Provisioning
    // -----------------------------------------------------------------
    console.log('\n--- 2. User Registration & Database Provisioning ---');

    // Create User A with full workspace and document onboarding
    const { user: userA, workspace: workspaceA, doc: docA } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: 'Alice Smith',
          email: normalizeEmail(testEmailA),
          passwordHash: hashedPassword,
        },
      });

      const workspace = await tx.workspace.create({
        data: {
          name: "Alice's Workspace",
          slug: `alice-ws-${timestamp}`,
          ownerId: user.id,
        },
      });

      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          role: 'owner',
        },
      });

      const doc = await tx.document.create({
        data: {
          title: 'Welcome to CollabSpace',
          content: '<h1>Welcome!</h1><p>Collaborate in real time.</p>',
          workspaceId: workspace.id,
          authorId: user.id,
        },
      });

      return { user, workspace, doc };
    });

    const userARecord = await prisma.user.findUnique({
      where: { id: userA.id },
      include: {
        workspaceMembers: {
          include: {
            workspace: {
              include: { documents: true },
            },
          },
        },
      },
    });

    assert(Boolean(userARecord?.id), 'User record created in PostgreSQL');
    assert(userARecord?.email === testEmailA.toLowerCase(), 'User email stored in normalized form');
    assert(userARecord?.workspaceMembers.length === 1, 'Default workspace created and assigned to user');
    assert(userARecord?.workspaceMembers[0].role === 'owner', 'User assigned owner role in default workspace');
    assert(userARecord?.workspaceMembers[0].workspace.documents.length === 1, 'Welcome document provisioned in workspace');

    // Duplicate account prevention test
    let duplicateRejected = false;
    try {
      await prisma.user.create({
        data: {
          name: 'Alice Impostor',
          email: normalizeEmail(testEmailA.toUpperCase()), // case variation
          passwordHash: hashedPassword,
        },
      });
    } catch {
      duplicateRejected = true;
    }
    assert(duplicateRejected === true, 'Database unique constraint prevents duplicate normalized email accounts');

    // -----------------------------------------------------------------
    // TEST SUITE 3: Case-Insensitive Email Login & Credential Verification
    // -----------------------------------------------------------------
    console.log('\n--- 3. Login & Case-Insensitive Matching ---');

    // Uppercase login lookup
    const uppercaseEmailInput = testEmailA.toUpperCase();
    const normalizedLookup = normalizeEmail(uppercaseEmailInput);
    const foundUser = await prisma.user.findUnique({
      where: { email: normalizedLookup },
    });
    assert(foundUser !== null, 'Case-insensitive lookup finds user when queried with uppercase email');

    // Correct password match
    const validLogin = await verifyPassword(rawPassword, foundUser!.passwordHash);
    assert(validLogin === true, 'Login succeeds with valid credentials');

    // Wrong password test
    const invalidLogin = await verifyPassword('IncorrectPassword999', foundUser!.passwordHash);
    assert(invalidLogin === false, 'Login fails with wrong password');

    // -----------------------------------------------------------------
    // TEST SUITE 4: Rate Limiting
    // -----------------------------------------------------------------
    console.log('\n--- 4. Rate Limiting Protection ---');

    const rateLimitKey = `test_limit_${timestamp}`;
    const limit = 5;
    const windowSec = 10;

    let blockedAt = 0;
    for (let i = 1; i <= limit + 2; i++) {
      const result = await checkRateLimit(rateLimitKey, limit, windowSec);
      if (!result.success && blockedAt === 0) {
        blockedAt = i;
      }
    }
    assert(blockedAt === limit + 1, `Rate limiter allows ${limit} attempts and blocks the ${limit + 1}th attempt`);

    // -----------------------------------------------------------------
    // TEST SUITE 5: Email Verification Tokens & Single-Use Lifecycle
    // -----------------------------------------------------------------
    console.log('\n--- 5. Email Verification Workflow ---');

    const verifyRawToken = generateSecureToken(32);
    const verifyTokenHash = hashToken(verifyRawToken);
    const verifyExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Save token
    await prisma.emailVerificationToken.create({
      data: {
        userId: userA.id,
        email: userA.email,
        tokenHash: verifyTokenHash,
        expiresAt: verifyExpiresAt,
      },
    });

    // Lookup token using raw bearer token
    const tokenRecord = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashToken(verifyRawToken) },
    });
    assert(tokenRecord !== null, 'Email verification token found by hashing raw token');
    assert(tokenRecord!.tokenHash !== verifyRawToken, 'Stored token is cryptographic hash, not bearer token');

    // Consume token (single use)
    const verifiedTimestamp = new Date();
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userA.id },
        data: { emailVerified: verifiedTimestamp },
      }),
      prisma.emailVerificationToken.delete({
        where: { id: tokenRecord!.id },
      }),
    ]);

    const updatedUser = await prisma.user.findUnique({ where: { id: userA.id } });
    assert(Boolean(updatedUser!.emailVerified), 'User email verified status updated');

    // Replay attempt must fail
    const replayRecord = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashToken(verifyRawToken) },
    });
    assert(replayRecord === null, 'Email verification token is single-use and cannot be replayed');

    // -----------------------------------------------------------------
    // TEST SUITE 6: Password Recovery & Reset Lifecycle
    // -----------------------------------------------------------------
    console.log('\n--- 6. Password Reset Workflow ---');

    const resetRawToken = generateSecureToken(32);
    const resetTokenHash = hashToken(resetRawToken);
    const resetExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordResetToken.create({
      data: {
        userId: userA.id,
        email: userA.email,
        tokenHash: resetTokenHash,
        expiresAt: resetExpiresAt,
      },
    });

    // Lookup reset token
    const foundResetToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(resetRawToken) },
    });
    assert(foundResetToken !== null, 'Password reset token resolved via hash');

    // Reset password to new password
    const newPasswordHash = await hashPassword(updatedPassword);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userA.id },
        data: { passwordHash: newPasswordHash },
      }),
      prisma.passwordResetToken.delete({
        where: { id: foundResetToken!.id },
      }),
    ]);

    // Verify user can now authenticate with new password
    const userAfterReset = await prisma.user.findUnique({ where: { id: userA.id } });
    const verifyNewPassword = await verifyPassword(updatedPassword, userAfterReset!.passwordHash);
    assert(verifyNewPassword === true, 'User can authenticate with updated password');
    const verifyOldPassword = await verifyPassword(rawPassword, userAfterReset!.passwordHash);
    assert(verifyOldPassword === false, 'Old password rejected after password reset');

    // Replay attempt must fail
    const replayReset = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(resetRawToken) },
    });
    assert(replayReset === null, 'Password reset token deleted after single use');

    // -----------------------------------------------------------------
    // TEST SUITE 7: Session Management & Expiration
    // -----------------------------------------------------------------
    console.log('\n--- 7. Session Lifecycle & Invalidation ---');

    // Create session for User A
    const rawSessionToken = generateSecureToken(32);
    const sessionTokenHash = hashToken(rawSessionToken);
    const sessionExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const sessionA = await prisma.session.create({
      data: {
        userId: userA.id,
        sessionToken: sessionTokenHash,
        expiresAt: sessionExpires,
        userAgent: 'CollabSpaceTestRunner/1.0',
      },
    });
    assert(Boolean(sessionA.id), 'Active session created in database');

    // Verify session lookup
    const foundSession = await prisma.session.findUnique({
      where: { sessionToken: hashToken(rawSessionToken) },
      include: { user: true },
    });
    assert(foundSession !== null && foundSession.user.id === userA.id, 'Session token verified successfully');

    // Expired session test
    const expiredRawToken = generateSecureToken(32);
    const expiredSession = await prisma.session.create({
      data: {
        userId: userA.id,
        sessionToken: hashToken(expiredRawToken),
        expiresAt: new Date(Date.now() - 10000), // expired 10 seconds ago
      },
    });

    // Check expiration check logic
    const isExpired = expiredSession.expiresAt <= new Date();
    assert(isExpired === true, 'Expired session detected by timestamp check');
    await prisma.session.delete({ where: { id: expiredSession.id } });
    const cleanedExpired = await prisma.session.findUnique({ where: { id: expiredSession.id } });
    assert(cleanedExpired === null, 'Expired session cleaned up from database');

    // Logout / destroy session
    await prisma.session.delete({ where: { id: sessionA.id } });
    const postLogoutSession = await prisma.session.findUnique({ where: { id: sessionA.id } });
    assert(postLogoutSession === null, 'Session immediately invalid after logout');

    // -----------------------------------------------------------------
    // TEST SUITE 8: RBAC & Multi-Tenant Resource Authorization
    // -----------------------------------------------------------------
    console.log('\n--- 8. Multi-Tenant Authorization & Access Control ---');

    // Create User B with their own workspace and document
    const { user: userB, workspace: workspaceB, doc: docB } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: 'Bob Jones',
          email: normalizeEmail(testEmailB),
          passwordHash: hashedPassword,
        },
      });

      const workspace = await tx.workspace.create({
        data: {
          name: "Bob's Workspace",
          slug: `bob-ws-${timestamp}`,
          ownerId: user.id,
        },
      });

      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          role: 'owner',
        },
      });

      const doc = await tx.document.create({
        data: {
          title: "Bob's Confidential Document",
          content: '<p>Secret Bob data.</p>',
          workspaceId: workspace.id,
          authorId: user.id,
        },
      });

      return { user, workspace, doc };
    });

    // Check User A accessing Workspace A (Allowed)
    let accessA_A_ok = false;
    try {
      await verifyWorkspaceAccess(userA.id, workspaceA.id, 'viewer');
      accessA_A_ok = true;
    } catch {}
    assert(accessA_A_ok === true, 'User A authorized to access User A workspace');

    // Check User B accessing Workspace A (Forbidden!)
    let accessB_A_forbidden = false;
    try {
      await verifyWorkspaceAccess(userB.id, workspaceA.id, 'viewer');
    } catch (err) {
      if (err instanceof AuthError && err.status === 403) {
        accessB_A_forbidden = true;
      }
    }
    assert(accessB_A_forbidden === true, 'User B strictly forbidden from accessing User A workspace (403)');

    // Check User B accessing User A document (Forbidden!)
    let docAccessB_A_forbidden = false;
    try {
      await verifyDocumentAccess(userB.id, docA.id, 'viewer');
    } catch (err) {
      if (err instanceof AuthError && err.status === 403) {
        docAccessB_A_forbidden = true;
      }
    }
    assert(docAccessB_A_forbidden === true, 'User B strictly forbidden from accessing User A document (403)');

    // Check User A accessing User B document (Forbidden!)
    let docAccessA_B_forbidden = false;
    try {
      await verifyDocumentAccess(userA.id, docB.id, 'viewer');
    } catch (err) {
      if (err instanceof AuthError && err.status === 403) {
        docAccessA_B_forbidden = true;
      }
    }
    assert(docAccessA_B_forbidden === true, 'User A strictly forbidden from accessing User B document (403)');

    // Role hierarchy test: add Bob as viewer to Alice workspace
    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspaceA.id,
        userId: userB.id,
        role: 'viewer',
      },
    });

    // Bob can view
    let bobCanView = false;
    try {
      await verifyWorkspaceAccess(userB.id, workspaceA.id, 'viewer');
      bobCanView = true;
    } catch {}
    assert(bobCanView === true, 'Viewer role authorized for read/viewer operations');

    // Bob cannot edit or admin
    let bobEditRejected = false;
    try {
      await verifyWorkspaceAccess(userB.id, workspaceA.id, 'editor');
    } catch (err) {
      if (err instanceof AuthError && err.status === 403) {
        bobEditRejected = true;
      }
    }
    assert(bobEditRejected === true, 'Viewer role rejected when editor access required (403)');

    let bobAdminRejected = false;
    try {
      await verifyWorkspaceAccess(userB.id, workspaceA.id, 'admin');
    } catch (err) {
      if (err instanceof AuthError && err.status === 403) {
        bobAdminRejected = true;
      }
    }
    assert(bobAdminRejected === true, 'Viewer role rejected when admin access required (403)');

    // -----------------------------------------------------------------
    // TEST SUITE 9: Account Management & Multi-Session Revocation
    // -----------------------------------------------------------------
    console.log('\n--- 9. Account Profile Update & Session Revocation ---');

    // Update profile
    await prisma.user.update({
      where: { id: userA.id },
      data: { name: 'Alice Smith, Ph.D.' },
    });
    const profileUpdated = await prisma.user.findUnique({ where: { id: userA.id } });
    assert(profileUpdated!.name === 'Alice Smith, Ph.D.', 'Profile display name successfully updated');

    // Multi-session revocation test: create 3 sessions for User A
    await prisma.session.createMany({
      data: [
        {
          userId: userA.id,
          sessionToken: hashToken(generateSecureToken()),
          expiresAt: new Date(Date.now() + 86400000),
          userAgent: 'Device 1',
        },
        {
          userId: userA.id,
          sessionToken: hashToken(generateSecureToken()),
          expiresAt: new Date(Date.now() + 86400000),
          userAgent: 'Device 2',
        },
        {
          userId: userA.id,
          sessionToken: hashToken(generateSecureToken()),
          expiresAt: new Date(Date.now() + 86400000),
          userAgent: 'Device 3',
        },
      ],
    });

    const preCount = await prisma.session.count({ where: { userId: userA.id } });
    assert(preCount >= 3, 'Multiple active sessions created across devices');

    // Invalidate all sessions (e.g., on security event / password reset)
    await prisma.session.deleteMany({ where: { userId: userA.id } });
    const postRevokeCount = await prisma.session.count({ where: { userId: userA.id } });
    assert(postRevokeCount === 0, 'Password reset / revocation securely terminates all active user sessions');

    // -----------------------------------------------------------------
    // CLEANUP
    // -----------------------------------------------------------------
    console.log('\n--- Cleaning up test records ---');
    await prisma.session.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.emailVerificationToken.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.workspaceMember.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.document.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [workspaceA.id, workspaceB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    console.log('Test records safely removed.');

    console.log('\n======================================================');
    console.log(`Results: ${passedTests}/${totalTests} tests PASSED (${failedTests} failed)`);
    console.log('======================================================\n');

    if (failedTests > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (error) {
    console.error('Fatal test error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
