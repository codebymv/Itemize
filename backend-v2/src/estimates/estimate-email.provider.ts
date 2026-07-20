import { Injectable } from '@nestjs/common';

export type EstimateEmailMessage = {
  to: string;
  subject: string;
  html: string;
  idempotencyKey: string;
};

export type EstimateEmailProviderResult =
  | { kind: 'sent'; providerId: string | null }
  | { kind: 'rejected'; message: string };

export const ESTIMATE_EMAIL_PROVIDER = Symbol('ESTIMATE_EMAIL_PROVIDER');

export interface EstimateEmailProvider {
  send(message: EstimateEmailMessage): Promise<EstimateEmailProviderResult>;
}

@Injectable()
export class ResendEstimateEmailProvider implements EstimateEmailProvider {
  async send(message: EstimateEmailMessage): Promise<EstimateEmailProviderResult> {
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
        from: process.env.EMAIL_FROM?.trim() || 'onboarding@resend.dev',
        to: [message.to],
        subject: message.subject,
        html: message.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json().catch(() => ({})) as {
      id?: string;
      message?: string;
      error?: { message?: string };
    };
    if (!response.ok) {
      return {
        kind: 'rejected',
        message: body.message || body.error?.message || `Email provider rejected the request (${response.status})`,
      };
    }
    return { kind: 'sent', providerId: body.id ?? null };
  }
}
