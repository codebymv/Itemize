import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { DeliveryIdentity, DurableEmailError, sendDurableEmail } from '../common/durable-email';
import { verifyEmailProviderResponse } from '../common/email-provider-receipt';
import { Inject, Injectable } from '@nestjs/common';

export type EstimateEmailMessage = {
  durableDelivery?: DeliveryIdentity;
  to: string;
  subject: string;
  html: string;
  text: string;
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
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}
  async send(message: EstimateEmailMessage): Promise<EstimateEmailProviderResult> {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      return { kind: 'rejected', message: 'Email service is not configured' };
    }
    if (message.durableDelivery) {
      try {
        const result = await sendDurableEmail(this.pool, message.durableDelivery, message.idempotencyKey, {
          from: process.env.EMAIL_FROM?.trim() || 'Itemize <noreply@itemize.cloud>',
          to: [message.to], subject: message.subject, html: message.html, text: message.text,
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
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json().catch(() => ({})) as {
      id?: string;
      message?: string;
      error?: { message?: string };
    };
    verifyEmailProviderResponse(response, body.id);
    if (!response.ok) {
      return {
        kind: 'rejected',
        message: body.message || body.error?.message || `Email provider rejected the request (${response.status})`,
      };
    }
    return { kind: 'sent', providerId: body.id ?? null };
  }
}
