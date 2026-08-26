import { Injectable } from '@nestjs/common';
import { InvoicePaymentResultRepository } from './invoice-payment-result.repository';

const CHECKOUT_SESSION = /^cs_(?:test_|live_)?[A-Za-z0-9]{8,240}$/;

export type PublicInvoicePaymentResult = {
  invoiceNumber: string;
  businessName: string;
  amount: string;
  currency: string;
  status: 'processing' | 'paid' | 'refunded';
  updatedAt: Date;
};

@Injectable()
export class InvoicePaymentResultService {
  constructor(private readonly results: InvoicePaymentResultRepository) {}

  async get(sessionId: string): Promise<PublicInvoicePaymentResult | null> {
    const normalized = sessionId.trim();
    if (!CHECKOUT_SESSION.test(normalized)) return null;
    const row = await this.results.findBySessionId(normalized);
    if (!row) return null;
    return {
      invoiceNumber: row.invoice_number,
      businessName: row.business_name,
      amount: row.amount,
      currency: row.currency,
      status: row.status === 'refunded'
        ? 'refunded'
        : row.status === 'paid'
          ? 'paid'
          : 'processing',
      updatedAt: row.updated_at,
    };
  }
}
