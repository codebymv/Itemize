import { Injectable, Logger } from '@nestjs/common';
import {
  brandedTransactionalEmail,
  transactionalEmailAssetOrigin,
} from '../common/branded-transactional-email';

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

  sendVerification(
    user: AuthEmailUser,
    token: string,
    invitationToken?: string,
  ): Promise<boolean> {
    const invitation = invitationToken
      ? `&invitation=${encodeURIComponent(invitationToken)}`
      : '';
    const url = `${this.appUrl()}/verify-email?token=${encodeURIComponent(token)}${invitation}`;
    const html = brandedTransactionalEmail({
      assetOrigin: transactionalEmailAssetOrigin(),
      previewText: 'Verify your email address to activate your Itemize account.',
      heading: 'Verify your email address',
      bodyHtml: this.greeting(user) +
        '<p style="margin:0">Confirm this email address to finish setting up your Itemize account.</p>' +
        '<p style="margin:20px 0 0;color:#64748b;font-size:13px">This secure link expires in 24 hours. If you did not create an Itemize account, you can ignore this email.</p>',
      cta: { label: 'Verify email address', url },
      showFooter: false,
    });
    return this.send(
      user,
      'Verify your Itemize account',
      `Verify your email by opening this link within 24 hours: ${url}`,
      html,
    );
  }

  sendWelcome(user: AuthEmailUser): Promise<boolean> {
    const url = `${this.appUrl()}/dashboard`;
    const html = brandedTransactionalEmail({
      assetOrigin: transactionalEmailAssetOrigin(),
      previewText: 'Your Itemize account is ready.',
      heading: 'Welcome to Itemize',
      bodyHtml: this.greeting(user) +
        '<p style="margin:0">Your email is verified and your workspace is ready.</p>',
      cta: { label: 'Open Itemize', url },
      footerText: 'Welcome to your Itemize workspace.',
    });
    return this.send(
      user,
      'Welcome to Itemize',
      `Your email is verified. Open Itemize: ${url}`,
      html,
    );
  }

  sendPasswordReset(user: AuthEmailUser, token: string): Promise<boolean> {
    const url = `${this.appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
    const html = brandedTransactionalEmail({
      assetOrigin: transactionalEmailAssetOrigin(),
      previewText: 'Reset your Itemize password using this secure link.',
      heading: 'Reset your password',
      bodyHtml: this.greeting(user) +
        '<p style="margin:0">We received a request to reset your Itemize password.</p>' +
        '<p style="margin:20px 0 0;color:#64748b;font-size:13px">This secure link expires in 1 hour. If you did not request a password reset, you can ignore this email.</p>',
      cta: { label: 'Reset password', url },
      showFooter: false,
    });
    return this.send(
      user,
      'Reset your Itemize password',
      `Reset your password by opening this link within 1 hour: ${url}`,
      html,
    );
  }

  sendPasswordChanged(user: AuthEmailUser): Promise<boolean> {
    const html = brandedTransactionalEmail({
      assetOrigin: transactionalEmailAssetOrigin(),
      previewText: 'Your Itemize password was changed.',
      heading: 'Password changed',
      bodyHtml: this.greeting(user) +
        '<p style="margin:0">Your Itemize password was changed successfully.</p>' +
        '<div style="margin-top:20px;padding:14px 16px;border:1px solid #fecaca;border-radius:8px;background:#fef2f2;color:#991b1b">If this was not you, reset your password and contact support immediately.</div>',
      showFooter: false,
    });
    return this.send(
      user,
      'Your Itemize password was changed',
      'Your Itemize password was changed. If this was not you, contact support immediately.',
      html,
    );
  }

  sendAccountDeleted(user: AuthEmailUser): Promise<boolean> {
    const html = brandedTransactionalEmail({
      assetOrigin: transactionalEmailAssetOrigin(),
      previewText: 'Your Itemize account was deleted.',
      heading: 'Account deleted',
      bodyHtml: this.greeting(user) +
        '<p style="margin:0">Your Itemize account and eligible personal workspaces have been permanently deleted.</p>' +
        '<p style="margin:20px 0 0;color:#64748b;font-size:13px">This message confirms the deletion request. If you did not make it, contact support immediately.</p>',
      showFooter: false,
    });
    return this.send(
      user,
      'Your Itemize account was deleted',
      'Your Itemize account and eligible personal workspaces were permanently deleted. If you did not request this, contact support immediately.',
      html,
    );
  }

  private greeting(user: AuthEmailUser): string {
    return `<p style="margin:0 0 16px">Hi ${escapeHtml(user.name)},</p>`;
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
