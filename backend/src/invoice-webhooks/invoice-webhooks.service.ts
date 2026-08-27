import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { ActivationService } from '../activation/activation.service';
import { InvoiceWebhooksRepository } from './invoice-webhooks.repository';
import {
  StripeCheckoutSession,
  StripeInvoiceEvent,
  StripeInvoiceWebhookResult,
} from './invoice-webhooks.types';

const STRIPE_ACCOUNT_ID = /^acct_[A-Za-z0-9]+$/;

export class StripeInvoiceWebhookInputError extends Error {
  constructor() {
    super('Stripe invoice webhook event is invalid');
    this.name = 'StripeInvoiceWebhookInputError';
  }
}

@Injectable()
export class InvoiceWebhooksService {
  constructor(
    private readonly repository: InvoiceWebhooksRepository,
    private readonly activation: ActivationService,
  ) {}

  async process(event: Stripe.Event): Promise<StripeInvoiceWebhookResult> {
    const result = await this.repository.process(this.normalize(event));
    if (result.activation) {
      await this.activation.recordArtifactAdvanced({
        organizationId: result.activation.organizationId,
        artifactType: 'invoice',
        artifactId: result.activation.invoiceId,
        stage: 'paid',
        source: 'invoice_payment_succeeded',
      });
    }
    const { activation: _activation, ...publicResult } = result;
    return publicResult;
  }

  private normalize(event: Stripe.Event): StripeInvoiceEvent {
    const id = this.text(event?.id, 255);
    const type = this.text(event?.type, 100);
    let session: StripeCheckoutSession | null = null;
    let connectedAccount: StripeInvoiceEvent['connectedAccount'] = null;
    let refund: StripeInvoiceEvent['refund'] = null;
    if (
      type === 'checkout.session.completed' ||
      type === 'checkout.session.expired'
    ) {
      session = this.session(event.data?.object);
    } else if (
      type === 'account.updated' ||
      type === 'account.application.deauthorized'
    ) {
      connectedAccount = this.connectedAccount(event, type);
    } else if (
      type === 'refund.created' || type === 'refund.updated' || type === 'refund.failed'
    ) {
      refund = this.refund(event);
    }
    return { id, type, session, connectedAccount, refund };
  }

  private refund(event: Stripe.Event): NonNullable<StripeInvoiceEvent['refund']> {
    const source = event.data?.object && typeof event.data.object === 'object'
      ? event.data.object as unknown as Record<string, unknown>
      : {};
    const refundId = this.text(source.id, 255);
    const paymentReference = this.reference(source.payment_intent, 'pi_');
    const stripeAccountId = this.text(event.account, 255);
    const cents = source.amount;
    const currency = this.text(source.currency, 3).toUpperCase();
    const rawStatus = this.text(source.status, 24);
    if (
      !/^re_[A-Za-z0-9_]+$/.test(refundId) ||
      !/^pi_[A-Za-z0-9_]+$/.test(paymentReference) ||
      !STRIPE_ACCOUNT_ID.test(stripeAccountId) ||
      !Number.isSafeInteger(cents) || Number(cents) < 1 ||
      !/^[A-Z]{3}$/.test(currency) ||
      !['pending', 'requires_action', 'succeeded', 'failed', 'canceled'].includes(rawStatus)
    ) {
      throw new StripeInvoiceWebhookInputError();
    }
    return {
      refundId,
      paymentReference,
      stripeAccountId,
      amount: (Number(cents) / 100).toFixed(2),
      currency,
      status: rawStatus as NonNullable<StripeInvoiceEvent['refund']>['status'],
      reason: this.optionalText(source.metadata && typeof source.metadata === 'object'
        ? (source.metadata as Record<string, unknown>).itemize_reason
        : source.reason, 500),
      failureCode: this.optionalText(source.failure_reason, 100),
    };
  }

  private reference(value: unknown, prefix: string): string {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object' && 'id' in value) {
      const id = (value as { id?: unknown }).id;
      return typeof id === 'string' && id.startsWith(prefix) ? id : '';
    }
    return '';
  }

  private connectedAccount(
    event: Stripe.Event,
    type: string,
  ): NonNullable<StripeInvoiceEvent['connectedAccount']> {
    const source =
      event.data?.object && typeof event.data.object === 'object'
        ? (event.data.object as unknown as Record<string, unknown>)
        : {};
    const stripeAccountId = String(event.account || source.id || '').trim();
    if (!STRIPE_ACCOUNT_ID.test(stripeAccountId)) {
      throw new StripeInvoiceWebhookInputError();
    }
    if (type === 'account.application.deauthorized') {
      return { stripeAccountId, connected: false };
    }
    return {
      stripeAccountId,
      connected:
        source.charges_enabled === true && source.details_submitted === true,
    };
  }

  private session(value: unknown): StripeCheckoutSession {
    if (!value || typeof value !== 'object') throw new StripeInvoiceWebhookInputError();
    const source = value as Record<string, unknown>;
    const metadata = source.metadata && typeof source.metadata === 'object'
      ? source.metadata as Record<string, unknown>
      : {};
    const paymentStatus = this.optionalText(source.payment_status, 40);
    const rawInvoiceId = metadata.invoice_id;
    const invoiceId = rawInvoiceId === undefined || rawInvoiceId === null
      ? null
      : this.positiveInteger(rawInvoiceId);
    const paymentReference = this.optionalText(
      source.payment_intent ?? source.id,
      255,
    );
    let amount: string | null = null;
    let currency: string | null = null;
    if (invoiceId !== null && paymentStatus === 'paid') {
      amount = this.cents(source.amount_total);
      const normalizedCurrency = this.text(source.currency, 3).toUpperCase();
      if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
        throw new StripeInvoiceWebhookInputError();
      }
      currency = normalizedCurrency;
      if (!paymentReference) throw new StripeInvoiceWebhookInputError();
    }
    return {
      id: this.text(source.id, 255),
      invoiceId,
      metadataOrganizationId: this.optionalText(metadata.organization_id, 40),
      paymentReference,
      paymentStatus,
      amount,
      currency,
    };
  }

  private cents(value: unknown): string {
    if (!Number.isSafeInteger(value) || Number(value) < 0) {
      throw new StripeInvoiceWebhookInputError();
    }
    const cents = BigInt(Number(value));
    return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
  }

  private positiveInteger(value: unknown): number {
    const text = String(value);
    if (!/^[1-9]\d{0,9}$/.test(text)) throw new StripeInvoiceWebhookInputError();
    const number = Number(text);
    if (!Number.isSafeInteger(number) || number > 2_147_483_647) {
      throw new StripeInvoiceWebhookInputError();
    }
    return number;
  }

  private text(value: unknown, max: number): string {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized || normalized.length > max) {
      throw new StripeInvoiceWebhookInputError();
    }
    return normalized;
  }

  private optionalText(value: unknown, max: number): string | null {
    if (value === undefined || value === null || value === '') return null;
    return this.text(value, max);
  }
}
