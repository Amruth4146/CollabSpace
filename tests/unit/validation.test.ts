import { describe, it, expect } from 'vitest';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '@/lib/auth/schemas';
import { sanitizeHtml, isValidProtocol } from '@/lib/sanitize';

describe('Validation Schemas', () => {
  describe('registerSchema', () => {
    it('accepts valid registration payload', () => {
      const valid = {
        name: 'Sarah Connor',
        email: 'sarah@skynet-defense.org',
        password: 'SecurePassword123!',
        confirmPassword: 'SecurePassword123!',
      };
      const result = registerSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('rejects passwords shorter than 8 characters', () => {
      const invalid = {
        name: 'Sarah Connor',
        email: 'sarah@skynet-defense.org',
        password: 'Pass1',
        confirmPassword: 'Pass1',
      };
      const result = registerSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message.includes('at least 8 characters'))).toBe(true);
      }
    });

    it('rejects mismatched passwords', () => {
      const invalid = {
        name: 'Sarah Connor',
        email: 'sarah@skynet-defense.org',
        password: 'Password123!',
        confirmPassword: 'DifferentPassword123!',
      };
      const result = registerSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message.includes('do not match'))).toBe(true);
      }
    });

    it('rejects invalid email formats', () => {
      const invalid = {
        name: 'Sarah Connor',
        email: 'not-an-email',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      };
      const result = registerSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('loginSchema', () => {
    it('accepts valid credentials with rememberMe flag', () => {
      const result = loginSchema.safeParse({
        email: 'john@collabspace.dev',
        password: 'ValidPassword123',
        rememberMe: true,
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing password', () => {
      const result = loginSchema.safeParse({
        email: 'john@collabspace.dev',
        password: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('forgotPasswordSchema & resetPasswordSchema', () => {
    it('validates email in forgot password', () => {
      expect(forgotPasswordSchema.safeParse({ email: 'valid@corp.io' }).success).toBe(true);
      expect(forgotPasswordSchema.safeParse({ email: 'invalid-email' }).success).toBe(false);
    });

    it('validates reset token and confirmed password', () => {
      const valid = {
        token: 'valid-reset-token',
        password: 'NewStrongPassword123',
        confirmPassword: 'NewStrongPassword123',
      };
      expect(resetPasswordSchema.safeParse(valid).success).toBe(true);
    });
  });

  describe('verifyEmailSchema', () => {
    it('requires a non-empty verification token', () => {
      expect(verifyEmailSchema.safeParse({ token: 'abc123token' }).success).toBe(true);
      expect(verifyEmailSchema.safeParse({ token: '' }).success).toBe(false);
    });
  });
});

describe('HTML Sanitization & XSS Prevention (sanitizeHtml)', () => {
  it('strips <script> tags and enclosed payload completely', () => {
    const dirty = '<p>Normal text</p><script>alert("XSS")</script><p>Safe paragraph</p>';
    const cleaned = sanitizeHtml(dirty);
    expect(cleaned).not.toContain('<script');
    expect(cleaned).not.toContain('alert("XSS")');
    expect(cleaned).toContain('<p>Normal text</p>');
    expect(cleaned).toContain('<p>Safe paragraph</p>');
  });

  it('strips inline event handlers like onerror and onclick', () => {
    const dirty = '<img src="valid.png" onerror="alert(document.cookie)" onload="steal()" />';
    const cleaned = sanitizeHtml(dirty);
    expect(cleaned).not.toContain('onerror');
    expect(cleaned).not.toContain('onload');
    expect(cleaned).not.toContain('alert');
    expect(cleaned).toContain('src="valid.png"');
  });

  it('neutralizes dangerous pseudo-protocols like javascript: and data: in links', () => {
    const dirty = '<a href="javascript:alert(1)">Click me</a><a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">Payload</a>';
    const cleaned = sanitizeHtml(dirty);
    expect(cleaned).not.toContain('javascript:');
    expect(cleaned).not.toContain('data:text/html');
    expect(cleaned).toContain('href="#"');
  });

  it('strips dangerous iframe and embed elements', () => {
    const dirty = '<iframe src="https://evil.com"></iframe><embed src="malware.swf" />';
    const cleaned = sanitizeHtml(dirty);
    expect(cleaned).not.toContain('<iframe');
    expect(cleaned).not.toContain('<embed');
  });

  it('identifies safe and unsafe protocols via isValidProtocol', () => {
    expect(isValidProtocol('https://google.com')).toBe(true);
    expect(isValidProtocol('http://localhost:3000')).toBe(true);
    expect(isValidProtocol('/dashboard')).toBe(true);
    expect(isValidProtocol('#section-header')).toBe(true);
    expect(isValidProtocol('mailto:support@collabspace.dev')).toBe(true);

    expect(isValidProtocol('javascript:alert(1)')).toBe(false);
    expect(isValidProtocol('data:text/html;base64,abc')).toBe(false);
    expect(isValidProtocol('vbscript:msgbox(1)')).toBe(false);
    expect(isValidProtocol('')).toBe(false);
  });
});
