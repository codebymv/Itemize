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

export const renderSignatureDeliveryEmail = (
  deliveryType: 'signature_request' | 'signature_reminder',
  idempotencyKey: string,
  payload: SignatureDeliveryPayload,
): { subject: string; html: string } => {
  const reminder = deliveryType === 'signature_reminder';
  const sender = payload.senderEmail || payload.senderName || 'Itemize';
  const subject = reminder
    ? `Reminder: Please sign ${payload.documentTitle || 'Document'}`
    : `${sender} wants your signature`;
  const signingUrl = `${frontendOrigin()}/sign/${signatureDeliveryToken(idempotencyKey)}`;
  const expires = payload.expiresAt
    ? new Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
    }).format(new Date(payload.expiresAt))
    : null;
  const greeting = reminder
    ? `<h1 style="font-size:22px;margin:0 0 16px;color:#111827">Signature Reminder</h1>
       <p style="color:#374151;margin:0 0 16px;line-height:1.6">Hi ${escapeHtml(payload.recipientName || 'there')}, this is a reminder to sign ${escapeHtml(payload.documentTitle || 'the document')} from ${escapeHtml(payload.senderName || 'Itemize')}.</p>`
    : '';
  return {
    subject,
    html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${escapeHtml(subject)}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1e293b;background:#fff;margin:0;padding:0">
<div style="max-width:600px;margin:0 auto;padding:32px 30px">${greeting}
<div style="white-space:pre-wrap;color:#374151;line-height:1.6">${escapeHtml(payload.message || '')}</div>
<div style="text-align:center;margin:24px 0"><a href="${escapeHtml(signingUrl)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:500">Review and Sign</a></div>
<p style="color:#6b7280;font-size:13px">Document: ${escapeHtml(payload.documentTitle)}</p>
${expires ? `<p style="color:#6b7280;font-size:13px">Expires on ${escapeHtml(expires)}</p>` : ''}
</div></body></html>`,
  };
};
