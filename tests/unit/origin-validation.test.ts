import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isOriginAllowed, isWildcardPatternSafe } from '../../server/collab-server';

describe('Hardened Cross-Domain WebSocket Origin Verification (Phase 7D-V2.2)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Non-Production Environments', () => {
    it('allows any origin when NODE_ENV is test or development', () => {
      Object.assign(process.env, { NODE_ENV: 'development' });
      expect(isOriginAllowed('http://localhost:3000')).toBe(true);
      expect(isOriginAllowed('https://any-external-domain.com')).toBe(true);
      expect(isOriginAllowed('https://random-preview.vercel.app')).toBe(true);
    });

    it('allows connections without an origin header (CLI tools, tests, native clients)', () => {
      Object.assign(process.env, { NODE_ENV: 'production' });
      expect(isOriginAllowed(undefined)).toBe(true);
    });
  });

  describe('Multi-Tenant Public Suffix Safety Validator', () => {
    it('prohibits bare multi-tenant wildcards (*.vercel.app, *.onrender.com, etc.)', () => {
      expect(isWildcardPatternSafe('*.vercel.app')).toBe(false);
      expect(isWildcardPatternSafe('https://*.vercel.app')).toBe(false);
      expect(isWildcardPatternSafe('*.onrender.com')).toBe(false);
      expect(isWildcardPatternSafe('*.railway.app')).toBe(false);
      expect(isWildcardPatternSafe('*.fly.dev')).toBe(false);
      expect(isWildcardPatternSafe('*.github.io')).toBe(false);
    });

    it('permits project-scoped wildcards (collabspace-*.vercel.app)', () => {
      expect(isWildcardPatternSafe('collabspace-*.vercel.app')).toBe(true);
      expect(isWildcardPatternSafe('collabspace-git-*.vercel.app')).toBe(true);
      expect(isWildcardPatternSafe('myteam-collabspace-*.onrender.com')).toBe(true);
      expect(isWildcardPatternSafe('*.internal.mycompany.com')).toBe(true);
    });
  });

  describe('Production Environment Enforcement', () => {
    beforeEach(() => {
      Object.assign(process.env, { NODE_ENV: 'production' });
      delete process.env.ALLOWED_ORIGINS;
      delete process.env.NEXT_PUBLIC_APP_URL;
    });

    it('rejects external connections when no allowlist is configured in production', () => {
      expect(isOriginAllowed('https://untrusted-site.com')).toBe(false);
      expect(isOriginAllowed('http://localhost:3000')).toBe(false);
    });

    it('allows origin matching NEXT_PUBLIC_APP_URL exactly', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://collabspace.vercel.app';
      expect(isOriginAllowed('https://collabspace.vercel.app')).toBe(true);
      expect(isOriginAllowed('https://collabspace.vercel.app:443')).toBe(true);
      expect(isOriginAllowed('https://evil-collabspace.vercel.app')).toBe(false);
      expect(isOriginAllowed('https://attackersite.com')).toBe(false);
    });

    it('supports comma-separated ALLOWED_ORIGINS', () => {
      process.env.ALLOWED_ORIGINS = 'https://collabspace.vercel.app, https://docs.collabspace.com';
      expect(isOriginAllowed('https://collabspace.vercel.app')).toBe(true);
      expect(isOriginAllowed('https://docs.collabspace.com')).toBe(true);
      expect(isOriginAllowed('https://other.collabspace.com')).toBe(false);
      expect(isOriginAllowed('https://attacker.org')).toBe(false);
    });

    it('prohibits bare *.vercel.app from accepting unrelated Vercel projects', () => {
      // Even if mistakenly configured with bare *.vercel.app, it must be ignored for safety
      process.env.ALLOWED_ORIGINS = 'https://collabspace.vercel.app, *.vercel.app';
      expect(isOriginAllowed('https://collabspace.vercel.app')).toBe(true);
      // Unrelated Vercel tenant must be REJECTED
      expect(isOriginAllowed('https://attacker-project.vercel.app')).toBe(false);
      expect(isOriginAllowed('https://random-tenant.vercel.app')).toBe(false);
    });

    it('permits configured project-prefixed preview wildcards (collabspace-*.vercel.app)', () => {
      process.env.ALLOWED_ORIGINS = 'https://collabspace.vercel.app, collabspace-*.vercel.app';
      expect(isOriginAllowed('https://collabspace.vercel.app')).toBe(true);
      expect(isOriginAllowed('https://collabspace-git-preview-user.vercel.app')).toBe(true);
      expect(isOriginAllowed('https://collabspace-feat-editor.vercel.app')).toBe(true);
      // Unrelated Vercel project must NOT match
      expect(isOriginAllowed('https://attacker-project.vercel.app')).toBe(false);
      expect(isOriginAllowed('https://otherteam.vercel.app')).toBe(false);
    });

    it('rejects localhost in production unless explicitly configured in ALLOWED_ORIGINS', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://collabspace.vercel.app';
      expect(isOriginAllowed('http://localhost:3000')).toBe(false);
      expect(isOriginAllowed('http://127.0.0.1:3000')).toBe(false);

      // Explicitly adding localhost permits it
      process.env.ALLOWED_ORIGINS = 'https://collabspace.vercel.app, http://localhost:3000';
      expect(isOriginAllowed('http://localhost:3000')).toBe(true);
    });

    it('supports permissive wildcard * when explicitly set for staging', () => {
      process.env.ALLOWED_ORIGINS = '*';
      expect(isOriginAllowed('https://anything.com')).toBe(true);
      expect(isOriginAllowed('http://localhost:8080')).toBe(true);
    });

    it('safely rejects malformed origin strings without throwing an uncaught exception', () => {
      expect(isOriginAllowed('not-a-valid-url')).toBe(false);
      expect(isOriginAllowed(':::invalid-uri:::')).toBe(false);
      expect(isOriginAllowed('')).toBe(true);
    });
  });
});
