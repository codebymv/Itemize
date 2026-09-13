import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { DeliveryIdentity, DurableEmailError, sendDurableEmail } from '../common/durable-email';
import { EmailAcceptanceUnknownError, verifyEmailProviderResponse } from '../common/email-provider-receipt';
import { Inject, Injectable } from '@nestjs/common';
import {
  brandedTransactionalEmail,
  transactionalEmailAssetOrigin,
} from '../common/branded-transactional-email';

export type ReputationDeliveryProviderResult =
  | { kind: 'sent'; providerId: string | null }
  | { kind: 'rejected'; message: string };

export type ReputationEmailMessage = {
  reviewUrl?: string;
  durableDelivery?: DeliveryIdentity;
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
};

export type ReputationSmsMessage = {
  to: string;
  message: string;
};

export const REPUTATION_EMAIL_PROVIDER = Symbol('REPUTATION_EMAIL_PROVIDER');
export const REPUTATION_SMS_PROVIDER = Symbol('REPUTATION_SMS_PROVIDER');

export interface ReputationEmailProvider {
  send(message: ReputationEmailMessage): Promise<ReputationDeliveryProviderResult>;
}

export interface ReputationSmsProvider {
  send(message: ReputationSmsMessage): Promise<ReputationDeliveryProviderResult>;
}

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char] as string);

@Injectable()
export class ResendReputationEmailProvider implements ReputationEmailProvider {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}
  async send(message: ReputationEmailMessage): Promise<ReputationDeliveryProviderResult> {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) return { kind: 'rejected', message: 'Email service is not configured' };
    const reviewUrl = message.reviewUrl;
    const suffix = reviewUrl ? `\n\nLeave a review: ${reviewUrl}\n\nThank you!` : null;
    const htmlText = suffix && message.text.endsWith(suffix)
      ? `${message.text.slice(0, -suffix.length)}\n\nThank you!` : message.text;
    const html = brandedTransactionalEmail({
      assetOrigin: transactionalEmailAssetOrigin(),
      previewText: htmlText,
      heading: message.subject,
      bodyHtml: `<div style="white-space:pre-wrap">${escapeHtml(htmlText)}</div>`,
      ...(reviewUrl ? { cta: { label: 'Leave a review', url: reviewUrl } } : {}),
      footerText: 'This feedback request was sent with Itemize.',
    });
    if (message.durableDelivery) {
      try {
        const result = await sendDurableEmail(this.pool, message.durableDelivery, message.idempotencyKey, {
          from: process.env.EMAIL_FROM?.trim() || 'Itemize <noreply@itemize.cloud>',
          to: [message.to], subject: message.subject, html: html, text: message.text,
        }, apiKey);
        return { kind: 'sent', providerId: result.providerId };
      } catch (error) {
        if (error instanceof DurableEmailError && !error.providerOutcomeUnknown) return { kind: 'rejected', message: error.message };
        throw error;
      }
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
        text: message.text,
        html,
      }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => { throw new EmailAcceptanceUnknownError(); });
    const body = await response.json().catch(() => ({})) as {
      id?: string; message?: string; error?: { message?: string };
    };
    verifyEmailProviderResponse(response, body.id);
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

@Injectable()
export class TwilioReputationSmsProvider implements ReputationSmsProvider {
  async send(message: ReputationSmsMessage): Promise<ReputationDeliveryProviderResult> {
    const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
    const token = process.env.TWILIO_AUTH_TOKEN?.trim();
    const from = process.env.TWILIO_PHONE_NUMBER?.trim();
    if (!sid || !token || !from) return { kind: 'rejected', message: 'SMS service is not configured' };
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: message.to, From: from, Body: message.message }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    const body = await response.json().catch(() => ({})) as { sid?: string; message?: string };
    if (!response.ok) {
      return { kind: 'rejected', message: body.message || `SMS provider rejected the request (${response.status})` };
    }
    if (!body.sid) throw new Error('SMS provider outcome is unknown');
    return { kind: 'sent', providerId: body.sid };
  }
}
