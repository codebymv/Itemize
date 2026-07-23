import { Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';
import { SignatureEmailPreviewInput } from './signature-delivery.inputs';
import { SignatureDeliveryRepository } from './signature-delivery.repository';
import { SignatureEmailPreview } from './signature-delivery.types';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character] as string);

const frontendOrigin = (): string => {
  const fallback = process.env.NODE_ENV === 'production'
    ? 'https://itemize.cloud'
    : 'http://localhost:5173';
  try {
    const configured = new URL(process.env.FRONTEND_URL ?? fallback);
    return configured.protocol === 'http:' || configured.protocol === 'https:'
      ? configured.origin
      : fallback;
  } catch {
    return fallback;
  }
};

@Injectable()
export class SignatureDeliveryService {
  constructor(private readonly repository: SignatureDeliveryRepository) {}

  async preview(organizationId: number, input: SignatureEmailPreviewInput): Promise<SignatureEmailPreview> {
    if (!(await this.repository.hasFeatureAccess(organizationId))) {
      throw itemizeGraphqlError('E-Signatures require an upgrade.', 'FORBIDDEN', {
        reason: 'FEATURE_NOT_AVAILABLE',
      });
    }
    const message = this.required(input.message, 'message', 50_000);
    const documentTitle = this.optional(input.documentTitle, 'documentTitle', 255);
    const senderName = this.optional(input.senderName, 'senderName', 255);
    const senderEmail = this.optional(input.senderEmail, 'senderEmail', 255);
    this.optional(input.recipientName, 'recipientName', 255);
    if (senderEmail !== null && !EMAIL.test(senderEmail)) {
      throw this.bad('senderEmail is invalid', 'senderEmail', 'INVALID_SIGNATURE_SENDER_EMAIL');
    }

    const senderLabel = senderEmail || senderName || 'Itemize';
    const subject = `${senderLabel} wants your signature`;
    const baseUrl = frontendOrigin();
    const signingUrl = `${baseUrl}/sign/preview`;
    const expires = input.expiresAt
      ? new Intl.DateTimeFormat('en-US', {
        year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
      }).format(input.expiresAt)
      : null;
    const year = new Date().getUTCFullYear();
    const safeBaseUrl = escapeHtml(baseUrl);

    return {
      subject,
      html: `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(subject)}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1e293b;background:#fff;margin:0;padding:0">
  <div style="max-width:600px;margin:0 auto;padding:20px;background:#fff">
    <div style="text-align:center;padding:20px"><a href="${safeBaseUrl}" target="_blank" rel="noopener noreferrer"><img src="${safeBaseUrl}/cover.png" alt="Itemize" width="200" style="display:block;margin:0 auto;max-width:200px;height:auto;border:0" /></a></div>
    <div style="padding:10px 30px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;text-align:center;font-size:13px">Email preview</div>
    <div style="padding:32px 30px;box-shadow:0 4px 6px -1px rgba(0,0,0,.1)">
      <div style="white-space:pre-wrap;color:#374151;line-height:1.6">${escapeHtml(message)}</div>
      <div style="text-align:center;margin:24px 0"><a href="${escapeHtml(signingUrl)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:500">Review and Sign</a></div>
      ${documentTitle ? `<p style="color:#6b7280;font-size:13px">Document: ${escapeHtml(documentTitle)}</p>` : ''}
      ${expires ? `<p style="color:#6b7280;font-size:13px">Expires on ${escapeHtml(expires)}</p>` : ''}
    </div>
    <div style="text-align:center;padding:30px 20px;color:#64748b;font-size:13px"><p style="margin:0 0 10px">© ${year} Itemize. All rights reserved.</p><p style="margin:0"><a href="${safeBaseUrl}" target="_blank" rel="noopener noreferrer">Visit Website</a></p></div>
  </div>
</body></html>`,
    };
  }

  private required(value: string, field: string, max: number): string {
    const normalized = String(value ?? '').trim();
    if (!normalized) throw this.bad('Message content is required', field, 'EMPTY_SIGNATURE_EMAIL_MESSAGE');
    if (normalized.length > max) throw this.bad('Message content is too long', field, 'SIGNATURE_EMAIL_MESSAGE_TOO_LONG');
    return normalized;
  }

  private optional(value: string | null | undefined, field: string, max: number): string | null {
    if (value === undefined || value === null) return null;
    const normalized = String(value).trim();
    if (!normalized) return null;
    if (normalized.length > max) throw this.bad(`${field} is too long`, field, `SIGNATURE_EMAIL_${field.toUpperCase()}_TOO_LONG`);
    return normalized;
  }

  private bad(message: string, field: string, reason: string) {
    return itemizeGraphqlError(message, 'BAD_USER_INPUT', { field, reason });
  }
}
