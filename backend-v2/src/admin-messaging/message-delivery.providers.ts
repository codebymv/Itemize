import { Injectable } from '@nestjs/common';

export type MessageEmail = {
  to: string;
  from: string;
  subject: string;
  html: string;
  text?: string | null;
  replyTo?: string | null;
  idempotencyKey: string;
  tags?: Array<{ name: string; value: string }>;
};

export type MessageSms = {
  to: string;
  from: string;
  message: string;
};

export type MessageProviderResult =
  | { kind: 'accepted'; providerId: string }
  | { kind: 'rejected'; message: string }
  | { kind: 'reconciliation'; message: string };

export const MESSAGE_EMAIL_PROVIDER = Symbol('MESSAGE_EMAIL_PROVIDER');
export const MESSAGE_SMS_PROVIDER = Symbol('MESSAGE_SMS_PROVIDER');

export interface MessageEmailProvider {
  send(message: MessageEmail): Promise<MessageProviderResult>;
}

export interface MessageSmsProvider {
  send(message: MessageSms): Promise<MessageProviderResult>;
}

@Injectable()
export class ResendMessageEmailProvider implements MessageEmailProvider {
  async send(message: MessageEmail): Promise<MessageProviderResult> {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      return { kind: 'rejected', message: 'Email service is not configured' };
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': message.idempotencyKey,
      },
      body: JSON.stringify({
        from: message.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        ...(message.text ? { text: message.text } : {}),
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        ...(message.tags?.length ? { tags: message.tags } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json().catch(() => ({})) as {
      id?: string;
      message?: string;
      error?: { message?: string };
    };
    if (!response.ok) {
      const detail = body.message || body.error?.message ||
        `Email provider rejected the request (${response.status})`;
      if (response.status === 429 || response.status >= 500) throw new Error(detail);
      return { kind: 'rejected', message: detail };
    }
    if (!body.id) throw new Error('Email provider outcome is unknown');
    return { kind: 'accepted', providerId: body.id };
  }
}

@Injectable()
export class TwilioMessageSmsProvider implements MessageSmsProvider {
  async send(message: MessageSms): Promise<MessageProviderResult> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
    const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
    if (!accountSid || !authToken || !message.from) {
      return { kind: 'rejected', message: 'SMS service is not configured' };
    }
    const form = new URLSearchParams({
      To: message.to,
      From: message.from,
      Body: message.message,
    });
    let response: Response;
    try {
      response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
          signal: AbortSignal.timeout(10_000),
        },
      );
    } catch {
      return {
        kind: 'reconciliation',
        message: 'SMS provider outcome is unknown and requires reconciliation',
      };
    }
    const body = await response.json().catch(() => ({})) as {
      sid?: string;
      message?: string;
    };
    if (!response.ok) {
      if (response.status === 429 || response.status >= 500) {
        return {
          kind: 'reconciliation',
          message: 'SMS provider outcome is unknown and requires reconciliation',
        };
      }
      return {
        kind: 'rejected',
        message: body.message || `SMS provider rejected the request (${response.status})`,
      };
    }
    if (!body.sid) {
      return {
        kind: 'reconciliation',
        message: 'SMS provider outcome is unknown and requires reconciliation',
      };
    }
    return { kind: 'accepted', providerId: body.sid };
  }
}
