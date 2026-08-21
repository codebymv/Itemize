import {
  brandedTransactionalEmail,
  transactionalEmailAssetOrigin,
} from '../common/branded-transactional-email';
import { signatureDeliveryToken } from './signature-delivery.token';

export type SignatureDeliveryPayload = {
  to: string;
  recipientName: string | null;
  documentTitle: string;
  senderName: string | null;
  senderEmail: string | null;
  message: string | null;
  expiresAt: string | null;
};

export type RenderedSignatureEmail = {
  subject: string;
  html: string;
  text: string;
};

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character] as string);

const frontendOrigin = (): string => {
  const fallback = process.env.NODE_ENV === 'production'
    ? 'https://itemize.cloud'
    : 'http://localhost:5173';
  try {
    const configured = new URL(process.env.FRONTEND_URL ?? fallback);
    return ['http:', 'https:'].includes(configured.protocol) ? configured.origin : fallback;
  } catch {
    return fallback;
  }
};

const formattedExpiry = (expiresAt: string | null): string | null => expiresAt
  ? new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  }).format(new Date(expiresAt))
  : null;

const requestEmail = (
  payload: SignatureDeliveryPayload,
  options: { reminder: boolean; signingUrl: string; preview: boolean },
): RenderedSignatureEmail => {
  const sender = payload.senderEmail || payload.senderName || 'Itemize';
  const subject = options.reminder
    ? `Reminder: Please sign ${payload.documentTitle || 'Document'}`
    : `${sender} wants your signature`;
  const heading = options.reminder ? 'Signature reminder' : 'Signature requested';
  const expires = formattedExpiry(payload.expiresAt);
  const greeting = `<p style="margin:0 0 16px">Hi ${escapeHtml(payload.recipientName || 'there')},</p>`;
  const context = options.reminder
    ? `<p style="margin:0 0 16px">This is a reminder to review and sign ${escapeHtml(payload.documentTitle || 'the document')} from ${escapeHtml(payload.senderName || 'Itemize')}.</p>`
    : '<p style="margin:0 0 16px">A document is ready for your review and signature.</p>';
  const message = payload.message
    ? `<div style="white-space:pre-wrap;margin:0 0 20px">${escapeHtml(payload.message)}</div>`
    : '';
  const preview = options.preview
    ? '<div style="margin:0 0 20px;padding:10px 14px;border:1px solid #fde68a;border-radius:8px;background:#fffbeb;color:#92400e;font-size:13px;font-weight:700">Email preview</div>'
    : '';
  const metadata =
    `<div style="margin-top:20px;padding:14px 16px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc">` +
    `<div style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.04em">Document</div>` +
    `<div style="margin-top:4px;color:#0f172a;font-weight:700">${escapeHtml(payload.documentTitle || 'Document')}</div>` +
    (expires
      ? `<div style="margin-top:10px;color:#64748b;font-size:13px">Expires on ${escapeHtml(expires)}</div>`
      : '') +
    '</div>';

  return {
    subject,
    html: brandedTransactionalEmail({
      assetOrigin: transactionalEmailAssetOrigin(),
      previewText: options.reminder
        ? 'A document is still waiting for your signature.'
        : 'A document is ready for your signature.',
      heading,
      bodyHtml: preview + greeting + context + message + metadata,
      cta: { label: 'Review and sign', url: options.signingUrl },
      footerText: 'This secure signature request was sent with Itemize.',
    }),
    text: [
      options.reminder
        ? `This is a reminder to sign ${payload.documentTitle || 'the document'}.`
        : 'A document is ready for your review and signature.',
      payload.message,
      `Document: ${payload.documentTitle || 'Document'}`,
      expires ? `Expires on ${expires}` : null,
      `Review and sign: ${options.signingUrl}`,
    ].filter(Boolean).join('\n\n'),
  };
};

export const renderSignatureDeliveryEmail = (
  deliveryType:
    | 'signature_request'
    | 'signature_reminder'
    | 'signer_completed'
    | 'document_completed'
    | 'signature_declined',
  idempotencyKey: string,
  payload: SignatureDeliveryPayload,
): RenderedSignatureEmail => {
  if (deliveryType === 'signer_completed') {
    const subject = `${payload.recipientName || 'A recipient'} signed ${payload.documentTitle}`;
    return notification(
      subject,
      'Signature received',
      `${payload.recipientName || 'A recipient'} completed their signature for ${payload.documentTitle}.`,
    );
  }
  if (deliveryType === 'document_completed') {
    const subject = `${payload.documentTitle} is complete`;
    return notification(
      subject,
      'Document completed',
      `${payload.documentTitle} has been signed by every recipient. Sign in to Itemize to review the completed document.`,
    );
  }
  if (deliveryType === 'signature_declined') {
    const subject = `Signature declined for ${payload.documentTitle}`;
    const reason = payload.message ? ` Reason: ${payload.message}` : '';
    return notification(
      subject,
      'Signature declined',
      `${payload.recipientName || 'A recipient'} declined to sign ${payload.documentTitle}.${reason}`,
    );
  }
  return requestEmail(payload, {
    reminder: deliveryType === 'signature_reminder',
    signingUrl: `${frontendOrigin()}/sign/${signatureDeliveryToken(idempotencyKey)}`,
    preview: false,
  });
};

export const renderSignaturePreviewEmail = (
  payload: SignatureDeliveryPayload,
  signingUrl: string,
): RenderedSignatureEmail => requestEmail(payload, {
  reminder: false,
  signingUrl,
  preview: true,
});

const notification = (
  subject: string,
  heading: string,
  message: string,
): RenderedSignatureEmail => ({
  subject,
  html: brandedTransactionalEmail({
    assetOrigin: transactionalEmailAssetOrigin(),
    previewText: message,
    heading,
    bodyHtml: `<p style="margin:0">${escapeHtml(message)}</p>`,
    footerText: 'Signature activity notification from Itemize.',
  }),
  text: message,
});
