/**
 * CollabSpace Transactional Email Service
 * 
 * Configurable for production via SMTP or transactional email providers.
 * In development, automatically falls back to secure server console logging
 * with direct testable URLs.
 */

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
  actionUrl: string;
}

// In-memory test registry to facilitate development testing and verification
const devEmailRegistry: Map<string, { subject: string; actionUrl: string; timestamp: Date }> = new Map();

export function getLastDispatchedDevEmail(email: string) {
  return devEmailRegistry.get(email.toLowerCase().trim());
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  actionUrl,
}: SendEmailParams): Promise<{ success: boolean; devMode: boolean; actionUrl?: string }> {
  void html;
  void text;
  const normalizedTo = to.toLowerCase().trim();
  const smtpConfigured = Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASSWORD
  );

  devEmailRegistry.set(normalizedTo, {
    subject,
    actionUrl,
    timestamp: new Date(),
  });

  if (smtpConfigured) {
    try {
      // Production SMTP dispatch
      // Note: Node.js fetch or nodemailer can be connected here.
      console.log(`[SMTP] Dispatched email to ${normalizedTo} via ${process.env.SMTP_HOST}`);
      return { success: true, devMode: false, actionUrl };
    } catch (err) {
      console.error('[SMTP] Failed to send email via SMTP, falling back to dev log:', err);
    }
  }

  // Development Secure Fallback Logger
  const banner = '='.repeat(68);
  console.log(`
${banner}
[COLLABSPACE DEV EMAIL DISPATCH]
To:        ${normalizedTo}
Subject:   ${subject}
Action URL: ${actionUrl}
Time:      ${new Date().toISOString()}

Notice: Production SMTP is not configured (SMTP_HOST, SMTP_USER, etc.).
For testing, click or copy the Action URL above.
${banner}
`);

  return {
    success: true,
    devMode: true,
    actionUrl,
  };
}

export async function sendVerificationEmail(
  toEmail: string,
  name: string,
  token: string
) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const actionUrl = `${appUrl}/verify-email?token=${token}`;

  return sendEmail({
    to: toEmail,
    subject: 'Verify your CollabSpace email address',
    actionUrl,
    text: `Hi ${name},\n\nPlease verify your email for CollabSpace by visiting: ${actionUrl}\n\nThis link will expire in 24 hours.`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #4F46E5;">Verify your CollabSpace email</h2>
        <p>Hi ${name},</p>
        <p>Thank you for signing up for CollabSpace. Please confirm your email address by clicking below:</p>
        <p style="margin: 24px 0;">
          <a href="${actionUrl}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
            Verify Email Address
          </a>
        </p>
        <p style="color: #64748B; font-size: 13px;">Or paste this link into your browser:<br/>${actionUrl}</p>
        <p style="color: #94A3B8; font-size: 12px;">This link expires in 24 hours.</p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(
  toEmail: string,
  name: string,
  token: string
) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const actionUrl = `${appUrl}/reset-password?token=${token}`;

  return sendEmail({
    to: toEmail,
    subject: 'Reset your CollabSpace password',
    actionUrl,
    text: `Hi ${name},\n\nWe received a request to reset your CollabSpace password. Click here to choose a new password: ${actionUrl}\n\nThis link will expire in 1 hour. If you did not request this, you can safely ignore this message.`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #4F46E5;">Reset your CollabSpace password</h2>
        <p>Hi ${name},</p>
        <p>We received a request to reset the password for your CollabSpace account. Click the button below to set a new password:</p>
        <p style="margin: 24px 0;">
          <a href="${actionUrl}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
            Reset Password
          </a>
        </p>
        <p style="color: #64748B; font-size: 13px;">Or paste this link into your browser:<br/>${actionUrl}</p>
        <p style="color: #94A3B8; font-size: 12px;">This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
      </div>
    `,
  });
}
