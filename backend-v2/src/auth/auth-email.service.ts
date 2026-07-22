import { Injectable, Logger } from '@nestjs/common';

type AuthEmailUser = { email: string; name: string };

const escapeHtml = (value: string): string =>
  value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character]!);

@Injectable()
export class AuthEmailService {
  private readonly logger = new Logger(AuthEmailService.name);

  sendVerification(user: AuthEmailUser, token: string): Promise<boolean> {
    const url = `${this.appUrl()}/verify-email?token=${encodeURIComponent(token)}`;
    return this.send(
      user,
      'Verify your Itemize account',
      `Verify your email by opening this link within 24 hours: ${url}`,
      `<p>Hi ${escapeHtml(user.name)},</p><p>Verify your email address to activate your Itemize account.</p><p><a href="${escapeHtml(url)}">Verify email address</a></p><p>This link expires in 24 hours.</p>`,
    );
  }

  sendWelcome(user: AuthEmailUser): Promise<boolean> {
    const url = `${this.appUrl()}/dashboard`;
    return this.send(
      user,
      'Welcome to Itemize',
      `Your email is verified. Open Itemize: ${url}`,
      `<p>Hi ${escapeHtml(user.name)},</p><p>Your email is verified and your Itemize account is ready.</p><p><a href="${escapeHtml(url)}">Open Itemize</a></p>`,
    );
  }

  sendPasswordReset(user: AuthEmailUser, token: string): Promise<boolean> {
    const url = `${this.appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
    return this.send(
      user,
      'Reset your Itemize password',
      `Reset your password by opening this link within 1 hour: ${url}`,
      `<p>Hi ${escapeHtml(user.name)},</p><p>We received a request to reset your Itemize password.</p><p><a href="${escapeHtml(url)}">Reset password</a></p><p>This link expires in 1 hour. If you did not request it, you can ignore this email.</p>`,
    );
  }

  sendPasswordChanged(user: AuthEmailUser): Promise<boolean> {
    return this.send(
      user,
      'Your Itemize password was changed',
      'Your Itemize password was changed. If this was not you, contact support immediately.',
      `<p>Hi ${escapeHtml(user.name)},</p><p>Your Itemize password was changed.</p><p>If this was not you, contact support immediately.</p>`,
    );
  }

  private async send(
    user: AuthEmailUser,
    subject: string,
    text: string,
    html: string,
  ): Promise<boolean> {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      if (process.env.NODE_ENV === 'production') {
        this.logger.error('Transactional auth email is not configured');
      }
      return false;
    }
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'Itemize <noreply@itemize.cloud>',
          to: [user.email],
          subject,
          text,
          html,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        this.logger.error(`Transactional auth email failed with HTTP ${response.status}`);
        return false;
      }
      return true;
    } catch (error) {
      this.logger.error(
        `Transactional auth email failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return false;
    }
  }

  private appUrl(): string {
    return (process.env.APP_URL || process.env.FRONTEND_URL || 'https://itemize.cloud')
      .replace(/\/$/, '');
  }
}
