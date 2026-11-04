import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  generateSecureToken,
  hashToken,
  constantTimeEquals,
  normalizeEmail,
} from '@/lib/auth/crypto';

describe('Security & Cryptography Library', () => {
  it('normalizes email addresses correctly', () => {
    expect(normalizeEmail('  User.Name@Example.COM  ')).toBe('user.name@example.com');
    expect(normalizeEmail('ALICE@WORK.IO')).toBe('alice@work.io');
  });

  it('hashes passwords with bcrypt cost factor >= 12 and verifies correctly', async () => {
    const password = 'SuperSecretPassword123!';
    const hash = await hashPassword(password);

    expect(hash).not.toBe(password);
    expect(hash).toMatch(/^\$2[aby]\$12\$/);

    const isValid = await verifyPassword(password, hash);
    expect(isValid).toBe(true);

    const isWrong = await verifyPassword('WrongPassword!', hash);
    expect(isWrong).toBe(false);
  });

  it('generates cryptographically secure 64-char hex tokens', () => {
    const token1 = generateSecureToken();
    const token2 = generateSecureToken();

    expect(token1).toHaveLength(64);
    expect(token2).toHaveLength(64);
    expect(token1).not.toBe(token2);
    expect(token1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashes tokens deterministically with SHA-256', () => {
    const token = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const hash1 = hashToken(token);
    const hash2 = hashToken(token);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
    expect(hash1).not.toBe(token);
  });

  it('implements constant-time string comparison to prevent timing attacks', () => {
    const strA = 'abcdef1234567890';
    const strB = 'abcdef1234567890';
    const strC = 'abcdef1234567891';
    const strD = 'abcdef';

    expect(constantTimeEquals(strA, strB)).toBe(true);
    expect(constantTimeEquals(strA, strC)).toBe(false);
    expect(constantTimeEquals(strA, strD)).toBe(false);
    expect(constantTimeEquals('', '')).toBe(true);
  });
});
