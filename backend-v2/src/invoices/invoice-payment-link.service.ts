import { Inject, Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';
import {
  INVOICE_PAYMENT_LINK_PROVIDER,
  InvoicePaymentLinkProvider,
} from './invoice-delivery.providers';
import {
  InvoicePaymentLinkResult,
  InvoicePaymentLinkStatus,
} from './invoice-payment-link.types';
import {
  InvoicePaymentLinkIntentRow,
  InvoicePaymentLinkPreparation,
  InvoicesRepository,
} from './invoices.repository';

const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

@Injectable()
export class InvoicePaymentLinkService {
  constructor(
    private readonly invoices: InvoicesRepository,
    @Inject(INVOICE_PAYMENT_LINK_PROVIDER)
    private readonly paymentLinks: InvoicePaymentLinkProvider,
  ) {}

  async create(
    organizationId: number,
    userId: number,
    invoiceId: number,
    idempotencyKey: string,
  ): Promise<InvoicePaymentLinkResult> {
    if (!Number.isSafeInteger(invoiceId) || invoiceId < 1) {
      throw itemizeGraphqlError('id is invalid', 'BAD_USER_INPUT', {
        field: 'id', reason: 'INVALID_INVOICE_ID',
      });
    }
    const key = String(idempotencyKey ?? '').trim();
    if (!KEY.test(key)) {
      throw itemizeGraphqlError(
        'idempotencyKey must be 1-128 safe ASCII characters',
        'BAD_USER_INPUT',
        { field: 'idempotencyKey', reason: 'INVALID_IDEMPOTENCY_KEY' },
      );
    }
    const prepared = await this.invoices.preparePaymentLink(
      organizationId, userId, invoiceId, key,
    );
    const intent = this.prepared(prepared);
    const replayed = prepared.kind === 'replayed';
    if (intent.status !== 'processing') return this.result(intent, true);

    try {
      const provider = await this.paymentLinks.getOrCreate({
        invoiceId: intent.invoice_id,
        invoiceNumber: intent.invoice_number,
        organizationId,
        amountDue: intent.amount_due,
        currency: intent.currency,
        customerName: intent.customer_name,
        customerEmail: intent.customer_email,
        existingSessionId: null,
        idempotencyKey: `invoice-payment-link:${organizationId}:${intent.id}`,
      });
      if (provider.kind === 'rejected') {
        return this.result(await this.invoices.failPaymentLink(
          organizationId, intent.id, provider.message, false,
        ), replayed);
      }
      return this.result(await this.invoices.completePaymentLink(
        organizationId, intent.id, provider.sessionId, provider.url,
      ), replayed);
    } catch (error) {
      return this.result(await this.invoices.failPaymentLink(
        organizationId, intent.id, this.error(error), true,
      ), replayed);
    }
  }

  private prepared(outcome: InvoicePaymentLinkPreparation): InvoicePaymentLinkIntentRow {
    if (outcome.kind === 'created' || outcome.kind === 'replayed') return outcome.intent;
    if (outcome.kind === 'not-found') {
      throw itemizeGraphqlError('Invoice not found', 'NOT_FOUND', {
        reason: 'INVOICE_NOT_FOUND',
      });
    }
    if (outcome.kind === 'not-payable') {
      throw itemizeGraphqlError('Invoice has no payable balance', 'CONFLICT', {
        reason: 'INVOICE_NOT_PAYABLE',
      });
    }
    if (outcome.kind === 'idempotency-conflict') {
      throw itemizeGraphqlError(
        'idempotencyKey refers to a stale invoice balance', 'CONFLICT',
        { field: 'idempotencyKey', reason: 'INVOICE_PAYMENT_LINK_IDEMPOTENCY_CONFLICT' },
      );
    }
    throw itemizeGraphqlError(
      'Invoice already has an unresolved payment-link request', 'CONFLICT',
      { reason: 'INVOICE_PAYMENT_LINK_IN_PROGRESS' },
    );
  }

  private result(
    row: InvoicePaymentLinkIntentRow,
    replayed: boolean,
  ): InvoicePaymentLinkResult {
    const status = row.status as InvoicePaymentLinkStatus;
    const ready = status === InvoicePaymentLinkStatus.READY;
    return {
      success: ready,
      replayed,
      intentId: Number(row.id),
      status,
      url: ready ? row.payment_url : null,
      sessionId: ready ? row.provider_session_id : null,
    };
  }

  private error(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown Stripe failure';
  }
}
