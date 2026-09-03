import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import { recordPayment } from './invoicesApi';
import { recordInvoicePaymentViaGraphql } from './invoicePaymentsApi';

vi.mock('@/lib/api', () => ({
  default: {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));
vi.mock('./invoicePaymentsApi', () => ({
  recordInvoicePaymentViaGraphql: vi.fn(),
}));

describe('invoice payment action transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records an invoice payment through GraphQL without an HTTP fallback', async () => {
    vi.mocked(recordInvoicePaymentViaGraphql).mockResolvedValue({
      payment: { id: 7 } as never,
      invoice: { amount_paid: 20, amount_due: 80, status: 'partial' },
    });
    await recordPayment(
      8,
      { amount: 20, payment_method: 'cash', payment_date: '2026-07-18' },
      4,
      'invoice-payment-record-0001',
    );
    expect(recordInvoicePaymentViaGraphql).toHaveBeenCalledWith(
      8,
      { amount: 20, payment_method: 'cash', payment_date: '2026-07-18' },
      4,
      'invoice-payment-record-0001',
    );
    expect(api.post).not.toHaveBeenCalled();
  });
});
