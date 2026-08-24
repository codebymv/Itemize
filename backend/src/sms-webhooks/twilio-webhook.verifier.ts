import { Request } from 'express';
import twilio from 'twilio';

export const TWILIO_WEBHOOK_VERIFIER = Symbol('TWILIO_WEBHOOK_VERIFIER');

export type TwilioVerificationOutcome =
  | { kind: 'ok' }
  | { kind: 'rejected'; status: number; body: string };

export interface TwilioWebhookVerifier {
  verify(request: Request): TwilioVerificationOutcome;
}

/**
 * Mirrors the retained verifyTwilioWebhookOrRespond decision table:
 * a non-production skip flag, fail-closed production behavior without a
 * token, and form-parameter signature validation over the public URL.
 * Behind the legacy-origin proxy the public host arrives as
 * x-forwarded-host; served directly, the Host header is already public.
 */
export class SdkTwilioWebhookVerifier implements TwilioWebhookVerifier {
  verify(request: Request): TwilioVerificationOutcome {
    if (
      process.env.SKIP_TWILIO_WEBHOOK_VALIDATION === 'true' &&
      process.env.NODE_ENV !== 'production'
    ) {
      return { kind: 'ok' };
    }

    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!token) {
      if (process.env.NODE_ENV === 'production') {
        return {
          kind: 'rejected',
          status: 503,
          body: 'Webhook verification unavailable',
        };
      }
      return { kind: 'ok' };
    }

    const twilioSignature = request.headers['x-twilio-signature'];
    const signature = Array.isArray(twilioSignature)
      ? twilioSignature[0]
      : twilioSignature;
    const host = request.get('x-forwarded-host') || request.get('host');
    const url = `${request.protocol}://${host}${request.originalUrl}`;

    if (process.env.NODE_ENV === 'production') {
      if (!signature) {
        return { kind: 'rejected', status: 403, body: 'Forbidden' };
      }
      if (!this.validate(token, signature, url, request.body)) {
        return { kind: 'rejected', status: 403, body: 'Invalid signature' };
      }
      return { kind: 'ok' };
    }

    if (signature && !this.validate(token, signature, url, request.body)) {
      return { kind: 'rejected', status: 403, body: 'Invalid signature' };
    }
    return { kind: 'ok' };
  }

  private validate(
    token: string,
    signature: string,
    url: string,
    params: unknown,
  ): boolean {
    if (!process.env.TWILIO_ACCOUNT_SID) return false;
    try {
      return twilio.validateRequest(
        token,
        signature,
        url,
        (params ?? {}) as Record<string, string>,
      );
    } catch {
      return false;
    }
  }
}
