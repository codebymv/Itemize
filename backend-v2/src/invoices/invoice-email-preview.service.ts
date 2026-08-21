import { Injectable } from '@nestjs/common';
import {
  brandedTransactionalEmail,
  transactionalEmailAssetOrigin,
} from '../common/branded-transactional-email';
import { itemizeGraphqlError } from '../common/graphql-error';
import { PreviewInvoiceEmailInput } from './invoice.inputs';
import { InvoiceEmailPreview } from './invoice.types';

const MAX_MESSAGE_LENGTH = 50_000;
const MAX_SUBJECT_LENGTH = 255;

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[char] as string);

@Injectable()
export class InvoiceEmailPreviewService {
  preview(input: PreviewInvoiceEmailInput): InvoiceEmailPreview {
    const message = String(input.message ?? '').trim();
    if (!message) {
      throw itemizeGraphqlError(
        'Message content is required',
        'BAD_USER_INPUT',
        { field: 'message', reason: 'EMPTY_INVOICE_EMAIL_MESSAGE' },
      );
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      throw itemizeGraphqlError(
        'Message content is too long',
        'BAD_USER_INPUT',
        { field: 'message', reason: 'INVOICE_EMAIL_MESSAGE_TOO_LONG' },
      );
    }
    const subject = String(input.subject ?? '').trim() || 'Invoice';
    if (subject.length > MAX_SUBJECT_LENGTH) {
      throw itemizeGraphqlError(
        'Email subject is too long',
        'BAD_USER_INPUT',
        { field: 'subject', reason: 'INVOICE_EMAIL_SUBJECT_TOO_LONG' },
      );
    }

    return {
      html: brandedTransactionalEmail({
        assetOrigin: transactionalEmailAssetOrigin(),
        previewText: 'Preview of your invoice email.',
        heading: subject,
        bodyHtml: `<div style="white-space:pre-wrap">${escapeHtml(message)}</div>`,
        ...(input.includePaymentLink
          ? { cta: { label: 'Pay now', url: '#' } }
          : {}),
        footerText: 'Your invoice PDF will be attached. Sent securely with Itemize.',
      }),
    };
  }
}
