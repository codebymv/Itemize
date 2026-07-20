import { Injectable } from '@nestjs/common';
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

const frontendOrigin = (): string => {
  const fallback = process.env.NODE_ENV === 'production'
    ? 'https://itemize.cloud'
    : 'http://localhost:5173';
  try {
    const configured = new URL(process.env.FRONTEND_URL ?? fallback);
    if (configured.protocol !== 'http:' && configured.protocol !== 'https:') {
      return fallback;
    }
    return configured.origin;
  } catch {
    return fallback;
  }
};

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

    const baseUrl = frontendOrigin();
    const safeBaseUrl = escapeHtml(baseUrl);
    const paymentLinkSection = input.includePaymentLink ? `
                <div style="text-align: center; margin: 24px 0;">
                    <a href="#" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500;">
                        Pay Now
                    </a>
                </div>` : '';
    const year = new Date().getFullYear();

    return {
      html: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>${escapeHtml(subject)}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; line-height: 1.6; color: #1e293b; background-color: #ffffff; margin: 0; padding: 0; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        a { color: #2563eb; }
        img { max-width: 100%; height: auto; }
        @media only screen and (max-width: 600px) { .email-wrapper { padding: 10px !important; } .email-body { padding: 20px !important; } }
    </style>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; line-height: 1.6; color: #1e293b; background-color: #ffffff; margin: 0; padding: 0;">
    <div class="email-wrapper" style="max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
        <div style="text-align: center; padding: 20px; background: #ffffff; border-radius: 12px 12px 0 0;">
            <a href="${safeBaseUrl}" target="_blank" rel="noopener noreferrer" style="text-decoration: none;">
                <img src="${safeBaseUrl}/cover.png" alt="Itemize" width="200" style="display: block; margin: 0 auto; max-width: 200px; height: auto; border: 0; outline: none;" />
            </a>
        </div>
        <div class="email-body" style="background-color: #ffffff; padding: 40px 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
            <div style="white-space: pre-wrap; color: #374151; line-height: 1.6;">${escapeHtml(message)}</div>${paymentLinkSection}
        </div>
        <div style="text-align: center; padding: 30px 20px; color: #64748b; font-size: 13px;">
            <p style="margin: 0 0 10px 0;">© ${year} Itemize. All rights reserved.</p>
            <p style="margin: 0;"><a href="${safeBaseUrl}" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: none;">Visit Website</a></p>
        </div>
    </div>
</body>
</html>`,
    };
  }
}
