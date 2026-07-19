import { Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';
import { PageInput, pageInfo } from '../common/pagination';
import {
  Payment,
  PaymentMethod,
  PaymentPage,
  PaymentStatus,
  RecordPaymentResult,
} from './payment.types';
import {
  PaymentRow,
  PaymentsRepository,
  RecordPaymentValues,
} from './payments.repository';
import {
  RecordInvoicePaymentInput,
  RecordPaymentInput,
} from './payment.inputs';

const ORGANIZATION_PAYMENT_METHODS = new Set<PaymentMethod>([
  PaymentMethod.CARD,
  PaymentMethod.BANK_TRANSFER,
  PaymentMethod.CASH,
  PaymentMethod.CHECK,
  PaymentMethod.OTHER,
]);
const ORGANIZATION_PAYMENT_STATUSES = new Set<PaymentStatus>([
  PaymentStatus.PENDING,
  PaymentStatus.PROCESSING,
  PaymentStatus.SUCCEEDED,
  PaymentStatus.FAILED,
]);

@Injectable()
export class PaymentsService {
  constructor(private readonly payments: PaymentsRepository) {}

  async list(
    organizationId: number,
    page: PageInput = new PageInput(),
    status?: PaymentStatus,
    paymentMethod?: PaymentMethod,
  ): Promise<PaymentPage> {
    const normalized = this.page(page);
    const result = await this.payments.findPage(
      organizationId,
      normalized.pageSize,
      normalized.offset,
      status,
      paymentMethod,
    );
    return {
      nodes: result.rows.map(this.map),
      pageInfo: pageInfo(
        normalized.page,
        normalized.pageSize,
        result.total,
      ),
    };
  }

  async record(
    organizationId: number,
    input: RecordPaymentInput,
  ): Promise<RecordPaymentResult> {
    if (input.invoiceId !== undefined) this.id(input.invoiceId, 'invoiceId');
    if (input.contactId !== undefined) this.id(input.contactId, 'contactId');
    if (!ORGANIZATION_PAYMENT_METHODS.has(input.paymentMethod)) {
      this.invalid('paymentMethod', 'INVALID_PAYMENT_METHOD');
    }
    if (!ORGANIZATION_PAYMENT_STATUSES.has(input.status)) {
      this.invalid('status', 'INVALID_PAYMENT_STATUS');
    }
    return this.persist(organizationId, {
      invoiceId: input.invoiceId ?? null,
      contactId: input.contactId ?? null,
      amount: this.amount(input.amount),
      currency: this.currency(input.currency),
      paymentMethod: input.paymentMethod,
      status: input.status,
      paymentDate: this.paymentDate(input.paymentDate),
      notes: this.notes(input.notes),
    });
  }

  async recordInvoice(
    organizationId: number,
    invoiceId: number,
    input: RecordInvoicePaymentInput,
  ): Promise<RecordPaymentResult> {
    this.id(invoiceId, 'invoiceId');
    return this.persist(organizationId, {
      invoiceId,
      contactId: null,
      amount: this.amount(input.amount),
      currency: 'USD',
      paymentMethod: input.paymentMethod,
      status: PaymentStatus.SUCCEEDED,
      paymentDate: null,
      notes: this.notes(input.notes),
    });
  }

  private async persist(
    organizationId: number,
    values: RecordPaymentValues,
  ): Promise<RecordPaymentResult> {
    const outcome = await this.payments.record(organizationId, values);
    if (outcome.kind === 'invoice-not-found') {
      throw itemizeGraphqlError('Invoice not found', 'NOT_FOUND');
    }
    if (outcome.kind === 'contact-not-found') {
      throw itemizeGraphqlError('Contact not found', 'NOT_FOUND');
    }
    return {
      payment: this.map(outcome.payment),
      invoice: outcome.invoice === null
        ? null
        : {
            amountPaid: outcome.invoice.amount_paid,
            amountDue: outcome.invoice.amount_due,
            status: outcome.invoice.status,
          },
    };
  }

  private page(input: PageInput) {
    if (
      !Number.isInteger(input.page) ||
      input.page < 1 ||
      !Number.isInteger(input.pageSize) ||
      input.pageSize < 1 ||
      input.pageSize > 100
    ) {
      throw itemizeGraphqlError('Invalid page input', 'BAD_USER_INPUT', {
        field: 'page',
        reason: 'INVALID_PAGE',
      });
    }
    return {
      page: input.page,
      pageSize: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
    };
  }

  private id(value: number, field: string): void {
    if (!Number.isSafeInteger(value) || value < 1) {
      this.invalid(field, `INVALID_${field.toUpperCase()}`);
    }
  }

  private amount(value: string): string {
    const normalized = value.trim();
    if (
      !/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(normalized) ||
      Number(normalized) <= 0
    ) {
      this.invalid('amount', 'INVALID_PAYMENT_AMOUNT');
    }
    return normalized;
  }

  private currency(value: string): string {
    const normalized = value.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalized)) {
      this.invalid('currency', 'INVALID_PAYMENT_CURRENCY');
    }
    return normalized;
  }

  private paymentDate(value?: string): string | null {
    if (value === undefined) return null;
    const normalized = value.trim();
    if (
      !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(normalized) ||
      Number.isNaN(Date.parse(normalized))
    ) {
      this.invalid('paymentDate', 'INVALID_PAYMENT_DATE');
    }
    return normalized;
  }

  private notes(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const normalized = value.trim();
    if (!normalized) return null;
    if (normalized.length > 10_000) {
      this.invalid('notes', 'INVALID_PAYMENT_NOTES');
    }
    return normalized;
  }

  private invalid(field: string, reason: string): never {
    throw itemizeGraphqlError(`Invalid ${field}`, 'BAD_USER_INPUT', {
      field,
      reason,
    });
  }

  private readonly map = (row: PaymentRow): Payment => ({
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    invoiceId: row.invoice_id === null ? null : Number(row.invoice_id),
    invoiceNumber: row.invoice_number,
    contactId: row.contact_id === null ? null : Number(row.contact_id),
    contactName: row.contact_name,
    amount: row.amount,
    currency: row.currency,
    paymentMethod: row.payment_method,
    status: row.status,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    cardLast4: row.card_last4,
    cardBrand: row.card_brand,
    description: row.description,
    notes: row.notes,
    receiptUrl: row.receipt_url,
    paidAt: row.paid_at === null ? null : new Date(row.paid_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  });
}
