import { Injectable, Logger } from '@nestjs/common';
import {
  brandedTransactionalEmail,
  transactionalEmailAssetOrigin,
} from '../common/branded-transactional-email';

type InvitationEmail = {
  email: string;
  organizationName: string;
  invitedByName: string | null;
  role: string;
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character]!);

@Injectable()
export class OrganizationInvitationEmailService {
  private readonly logger = new Logger(OrganizationInvitationEmailService.name);

  async send(
    invitation: InvitationEmail,
    token: string,
    idempotencyKey: string,
  ): Promise<boolean> {
    const url = `${this.appUrl()}/invite/${encodeURIComponent(token)}`;
    const organizationName = escapeHtml(invitation.organizationName);
    const inviter = invitation.invitedByName
      ? `${escapeHtml(invitation.invitedByName)} invited you`
      : 'You were invited';
    const role = escapeHtml(invitation.role);
    const html = brandedTransactionalEmail({
      assetOrigin: transactionalEmailAssetOrigin(),
      previewText: `Join ${invitation.organizationName} on Itemize.`,
      heading: `Join ${organizationName}`,
      bodyHtml:
        `<p style="margin:0">${inviter} to join <strong>${organizationName}</strong> as ${role}.</p>` +
        '<p style="margin:20px 0 0;color:#64748b;font-size:13px">This secure invitation expires in 7 days and can only be accepted by the invited email address.</p>',
      cta: { label: 'Accept invitation', url },
      showFooter: false,
    });
    return this.deliver(
      invitation.email,
      `You're invited to ${invitation.organizationName} on Itemize`,
      `Join ${invitation.organizationName} as ${invitation.role} within 7 days: ${url}`,
      html,
      idempotencyKey,
    );
  }

  private async deliver(
    email: string,
    subject: string,
    text: string,
    html: string,
    idempotencyKey: string,
  ): Promise<boolean> {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      if (process.env.NODE_ENV === 'production') {
        this.logger.error('Organization invitation email is not configured');
      }
      return false;
    }
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'Itemize <noreply@itemize.cloud>',
          to: [email],
          subject,
          text,
          html,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        this.logger.error(`Organization invitation email failed with HTTP ${response.status}`);
        return false;
      }
      return true;
    } catch (error) {
      this.logger.error(
        `Organization invitation email failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return false;
    }
  }

  private appUrl(): string {
    return (process.env.APP_URL || process.env.FRONTEND_URL || 'https://itemize.cloud')
      .replace(/\/$/, '');
  }
}
