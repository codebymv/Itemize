import { Injectable, Logger } from '@nestjs/common';
import {
  brandedTransactionalEmail,
  transactionalEmailAssetOrigin,
} from '../common/branded-transactional-email';
import type { OrganizationOwnershipTransferDelivery } from './organizations.repository';

const escapeHtml = (value: string): string =>
  value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character]!);

@Injectable()
export class OrganizationOwnershipEmailService {
  private readonly logger = new Logger(OrganizationOwnershipEmailService.name);

  async send(transfer: OrganizationOwnershipTransferDelivery): Promise<void> {
    const organizationUrl = `${this.appUrl()}/organization-settings`;
    const organizationName = escapeHtml(transfer.organizationName);
    const previousOwnerDisplay = transfer.previousOwner.name || transfer.previousOwner.email;
    const newOwnerDisplay = transfer.newOwner.name || transfer.newOwner.email;
    const previousOwner = escapeHtml(previousOwnerDisplay);
    const newOwner = escapeHtml(newOwnerDisplay);

    const newOwnerHtml = brandedTransactionalEmail({
      assetOrigin: transactionalEmailAssetOrigin(),
      previewText: `You now own ${transfer.organizationName} on Itemize.`,
      heading: `You now own ${transfer.organizationName}`,
      bodyHtml:
        `<p style="margin:0">${previousOwner} transferred <strong>${organizationName}</strong> to you.</p>` +
        '<p style="margin:20px 0 0">The organization, its workspace data, plan, and billing settings remain unchanged. You can now manage ownership, members, and billing.</p>',
      cta: { label: 'Open organization settings', url: organizationUrl },
      showFooter: false,
    });
    const previousOwnerHtml = brandedTransactionalEmail({
      assetOrigin: transactionalEmailAssetOrigin(),
      previewText: `${newOwnerDisplay} now owns ${transfer.organizationName}.`,
      heading: 'Organization ownership transferred',
      bodyHtml:
        `<p style="margin:0">${newOwner} now owns <strong>${organizationName}</strong>.</p>` +
        '<p style="margin:20px 0 0">You remain an organization admin. The organization, its workspace data, plan, and billing settings remain unchanged.</p>',
      cta: { label: 'Open organization settings', url: organizationUrl },
      showFooter: false,
    });

    await Promise.all([
      this.deliver(
        transfer.newOwner.email,
        `You now own ${transfer.organizationName} on Itemize`,
        `${previousOwnerDisplay} transferred ${transfer.organizationName} to you. The organization plan and billing remain unchanged: ${organizationUrl}`,
        newOwnerHtml,
      ),
      this.deliver(
        transfer.previousOwner.email,
        `Ownership of ${transfer.organizationName} was transferred`,
        `${newOwnerDisplay} now owns ${transfer.organizationName}. You remain an admin: ${organizationUrl}`,
        previousOwnerHtml,
      ),
    ]);
  }

  private async deliver(
    email: string,
    subject: string,
    text: string,
    html: string,
  ): Promise<boolean> {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      if (process.env.NODE_ENV === 'production') {
        this.logger.error('Organization ownership email is not configured');
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
          to: [email],
          subject,
          text,
          html,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        this.logger.error(`Organization ownership email failed with HTTP ${response.status}`);
        return false;
      }
      return true;
    } catch (error) {
      this.logger.error(
        `Organization ownership email failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return false;
    }
  }

  private appUrl(): string {
    return (process.env.APP_URL || process.env.FRONTEND_URL || 'https://itemize.cloud')
      .replace(/\/$/, '');
  }
}
