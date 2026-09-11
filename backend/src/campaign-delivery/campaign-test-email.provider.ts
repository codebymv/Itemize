import { Injectable } from '@nestjs/common';

export type CampaignTestEmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string | null;
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  headers?: Record<string, string>;
  idempotencyKey: string;
};

export type CampaignTestEmailProviderResult =
  | { kind: 'sent'; providerId: string | null }
  | { kind: 'rejected'; message: string };

export const CAMPAIGN_TEST_EMAIL_PROVIDER = Symbol('CAMPAIGN_TEST_EMAIL_PROVIDER');

export interface CampaignTestEmailProvider {
  send(message: CampaignTestEmailMessage): Promise<CampaignTestEmailProviderResult>;
}

@Injectable()
export class ResendCampaignTestEmailProvider implements CampaignTestEmailProvider {
  async send(message: CampaignTestEmailMessage): Promise<CampaignTestEmailProviderResult> {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) return { kind: 'rejected', message: 'Email service is not configured' };
    const configuredFrom = process.env.EMAIL_FROM?.trim() || 'Itemize <noreply@itemize.cloud>';
    const sender = message.fromEmail?.trim() || configuredFrom;
    // EMAIL_FROM may already be "Itemize <noreply@itemize.cloud>".
    // Replace its display name rather than nesting a second mailbox wrapper.
    const mailbox = sender.match(/<([^<>]+)>\s*$/)?.[1]?.trim() || sender;
    const displayName = message.fromName?.trim();
    const from = displayName
      ? `${JSON.stringify(displayName)} <${mailbox}>`
      : sender;
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': message.idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        ...(message.text ? { text: message.text } : {}),
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        ...(message.headers ? { headers: message.headers } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json().catch(() => ({})) as {
      id?: string; message?: string; error?: { message?: string };
    };
    if (!response.ok) {
      return {
        kind: 'rejected',
        message: body.message || body.error?.message ||
          `Email provider rejected the request (${response.status})`,
      };
    }
    return { kind: 'sent', providerId: body.id ?? null };
  }
}
