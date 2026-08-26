import { Injectable } from '@nestjs/common';

export type StripeRefundRequest = {
  paymentIntentId: string;
  stripeAccountId: string;
  amount: string;
  paymentId: number;
  organizationId: number;
  idempotencyKey: string;
  reason: string | null;
};

export type StripeRefundResult =
  | {
      kind: 'accepted';
      refundId: string;
      status: 'pending' | 'requires_action' | 'succeeded' | 'failed' | 'canceled';
      failureCode: string | null;
      failureMessage: string | null;
    }
  | { kind: 'rejected'; message: string };

const CONNECTED_ACCOUNT = /^acct_[A-Za-z0-9]+$/;
const PAYMENT_INTENT = /^pi_[A-Za-z0-9_]+$/;

@Injectable()
export class StripeRefundProvider {
  async create(request: StripeRefundRequest): Promise<StripeRefundResult> {
    const secret = process.env.STRIPE_SECRET_KEY?.trim();
    if (!secret) return { kind: 'rejected', message: 'Stripe is not configured' };
    if (!CONNECTED_ACCOUNT.test(request.stripeAccountId)) {
      return { kind: 'rejected', message: 'The connected Stripe account is unavailable' };
    }
    if (!PAYMENT_INTENT.test(request.paymentIntentId)) {
      return { kind: 'rejected', message: 'This payment cannot be refunded through Stripe' };
    }
    const amount = Math.round(Number(request.amount) * 100);
    if (!Number.isSafeInteger(amount) || amount < 1) {
      return { kind: 'rejected', message: 'Refund amount is invalid' };
    }
    const form = new URLSearchParams({
      payment_intent: request.paymentIntentId,
      amount: String(amount),
      'metadata[itemize_payment_id]': String(request.paymentId),
      'metadata[itemize_organization_id]': String(request.organizationId),
    });
    if (request.reason) form.set('metadata[itemize_reason]', request.reason.slice(0, 500));
    const response = await fetch('https://api.stripe.com/v1/refunds', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Stripe-Account': request.stripeAccountId,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': request.idempotencyKey,
      },
      body: form.toString(),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json().catch(() => ({})) as Record<string, any>;
    if (!response.ok || !body.id) {
      return {
        kind: 'rejected',
        message: String(body.error?.message || 'Stripe rejected the refund'),
      };
    }
    const status = String(body.status || 'pending');
    return {
      kind: 'accepted',
      refundId: String(body.id),
      status: status === 'succeeded' || status === 'failed' ||
        status === 'requires_action' || status === 'canceled'
        ? status
        : 'pending',
      failureCode: body.failure_reason ? String(body.failure_reason) : null,
      failureMessage: null,
    };
  }
}
