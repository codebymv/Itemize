import { Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';
import { PageInput, pageInfo } from '../common/pagination';
import {
  Payment,
  PaymentMethod,
  PaymentPage,
  PaymentStatus,
} from './payment.types';
import { PaymentRow, PaymentsRepository } from './payments.repository';

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
