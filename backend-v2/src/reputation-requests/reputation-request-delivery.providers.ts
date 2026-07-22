import { Injectable } from '@nestjs/common';

export type ReputationDeliveryProviderResult =
  | { kind: 'sent'; providerId: string | null }
  | { kind: 'rejected'; message: string };

export type ReputationEmailMessage = {
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
  async send(message: ReputationEmailMessage): Promise<ReputationDeliveryProviderResult> {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) return { kind: 'rejected', message: 'Email service is not configured' };
    const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;white-space:pre-wrap;line-height:1.6">${escapeHtml(message.text)}</div>`;
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': message.idempotencyKey,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM?.trim() || 'onboarding@resend.dev',
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html,
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
