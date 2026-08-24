/**
 * Delivery boundary for subscription notification emails, mirroring the
 * legacy Resend send path (backend/src/services/emailService.js
 * sendEmail): same from-address default, tags, and provider-level
 * idempotency key so a retried claim cannot double-send.
 */
import { Injectable } from '@nestjs/common';

export type SubscriptionNotificationEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  tags: Array<{ name: string; value: string }>;
  idempotencyKey: string;
};

export type SubscriptionNotificationSendResult = {
  success: boolean;
  id?: string | null;
  error?: string;
};

export const SUBSCRIPTION_NOTIFICATION_EMAIL_PROVIDER = Symbol(
  'SUBSCRIPTION_NOTIFICATION_EMAIL_PROVIDER',
);

export interface SubscriptionNotificationEmailProvider {
  send(
    message: SubscriptionNotificationEmail,
  ): Promise<SubscriptionNotificationSendResult>;
}

@Injectable()
export class ResendSubscriptionNotificationEmailProvider
  implements SubscriptionNotificationEmailProvider
{
  async send(
    message: SubscriptionNotificationEmail,
  ): Promise<SubscriptionNotificationSendResult> {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      return { success: false, error: 'Email service not configured' };
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': message.idempotencyKey,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM?.trim() || 'Itemize <noreply@itemize.cloud>',
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        tags: message.tags,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      error?: { message?: string };
    };
    if (!response.ok) {
      return {
        success: false,
        error:
          body.message ||
          body.error?.message ||
          `Email provider rejected the request (${response.status})`,
      };
    }
    return { success: true, id: body.id || null };
  }
}
