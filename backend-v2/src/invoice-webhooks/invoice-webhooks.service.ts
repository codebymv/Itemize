import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { InvoiceWebhooksRepository } from './invoice-webhooks.repository';
import {
  StripeCheckoutSession,
  StripeInvoiceEvent,
  StripeInvoiceWebhookResult,
} from './invoice-webhooks.types';

export class StripeInvoiceWebhookInputError extends Error {
  constructor() {
    super('Stripe invoice webhook event is invalid');
    this.name = 'StripeInvoiceWebhookInputError';
  }
}

@Injectable()
export class InvoiceWebhooksService {
  constructor(private readonly repository: InvoiceWebhooksRepository) {}

  async process(event: Stripe.Event): Promise<StripeInvoiceWebhookResult> {
    return this.repository.process(this.normalize(event));
  }

  private normalize(event: Stripe.Event): StripeInvoiceEvent {
    const id = this.text(event?.id, 255);
    const type = this.text(event?.type, 100);
    let session: StripeCheckoutSession | null = null;
    if (type === 'checkout.session.completed') {
      session = this.session(event.data?.object);
    }
    return { id, type, session };
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
