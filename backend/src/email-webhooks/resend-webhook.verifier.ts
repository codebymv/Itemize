import { Resend } from 'resend';

export const RESEND_WEBHOOK_VERIFIER = Symbol('RESEND_WEBHOOK_VERIFIER');

export class ResendWebhookUnavailableError extends Error {
  constructor() {
    super('Resend webhook secret is not configured');
    this.name = 'ResendWebhookUnavailableError';
  }
}

export class ResendWebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResendWebhookVerificationError';
  }
}

export type ResendWebhookHeaders = Record<
  string,
  string | string[] | undefined
>;

export interface ResendWebhookVerifier {
  verify(rawBody: Buffer, headers: ResendWebhookHeaders): unknown;
}

const single = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export class SdkResendWebhookVerifier implements ResendWebhookVerifier {
  verify(rawBody: Buffer, headers: ResendWebhookHeaders): unknown {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) throw new ResendWebhookUnavailableError();
    if (!Buffer.isBuffer(rawBody)) {
      throw new ResendWebhookVerificationError('Raw webhook body is required');
    }
    const id = single(headers['svix-id']);
    const timestamp = single(headers['svix-timestamp']);
    const signature = single(headers['svix-signature']);
    if (!id || !timestamp || !signature) {
      throw new ResendWebhookVerificationError(
        'Missing webhook signature headers',
      );
    }
    const resend = new Resend(
      process.env.RESEND_API_KEY || 're_webhook_verification_only',
    );
    try {
      return resend.webhooks.verify({
        payload: rawBody.toString('utf8'),
        headers: { id, timestamp, signature },
        webhookSecret: secret,
      });
    } catch (error) {
      throw new ResendWebhookVerificationError((error as Error).message);
    }
  }
}
