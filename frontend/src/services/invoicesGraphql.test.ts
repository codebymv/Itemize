import { beforeEach, describe, expect, it, vi } from 'vitest';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';
import {
  createInvoiceViaGraphql,
  createInvoicePaymentLinkViaGraphql,
  deleteInvoiceViaGraphql,
  getInvoiceViaGraphql,
  getInvoicesViaGraphql,
  sendInvoiceViaGraphql,
  updateInvoiceViaGraphql,
} from './invoicesGraphql';

vi.mock('./graphqlClient', () => ({
  graphqlMutationRequest: vi.fn(),
  graphqlRequest: vi.fn(),
}));

const graphqlInvoice = (extra: Record<string, unknown> = {}) => ({
  id: 12,
  organizationId: 4,
  invoiceNumber: 'INV-00012',
  contactId: null,
  businessId: null,
  customerName: 'Ada',
  customerEmail: null,
  customerPhone: null,
  customerAddress: null,
  issueDate: '2026-07-18',
  dueDate: '2026-08-17',
  subtotal: '25.00',
  taxRate: '8.25',
  taxAmount: '2.06',
  discountAmount: '1.00',
  discountType: 'fixed',
  discountValue: '1.00',
  total: '26.06',
  amountPaid: '0.00',
  amountDue: '26.06',
  currency: 'USD',
  status: 'draft',
  paymentTerms: null,
  paymentInstructions: null,
  notes: null,
  termsAndConditions: null,
  stripeInvoiceId: null,
  stripePaymentIntentId: null,
  stripeHostedInvoiceUrl: null,
  stripePdfUrl: null,
  sentAt: null,
  viewedAt: null,
  paidAt: null,
  isRecurring: false,
  recurringInterval: null,
  parentInvoiceId: null,
  customFields: {},
  createdById: 7,
  createdAt: '2026-07-18T12:00:00.000Z',
  updatedAt: '2026-07-18T12:00:00.000Z',
  contactFirstName: null,
  contactLastName: null,
  contactEmail: null,
  ...extra,
});

describe('core invoice GraphQL adapter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps list filters, pagination, and decimal strings', async () => {
    vi.mocked(graphqlRequest).mockResolvedValue({
      invoices: {
        nodes: [graphqlInvoice()],
        pageInfo: { page: 2, pageSize: 10, total: 21, totalPages: 3 },
      },
    });
    await expect(
      getInvoicesViaGraphql({
        status: 'draft',
        contact_id: 9,
        search: 'Ada',
        page: 2,
        limit: 10,
      }, 4),
    ).resolves.toMatchObject({
      invoices: [{ total: 26.06, amount_due: 26.06 }],
      pagination: { page: 2, limit: 10, total: 21, totalPages: 3 },
    });
    expect(graphqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('query Invoices'),
      {
        filter: { status: 'draft', contactId: 9, search: 'Ada' },
        page: { page: 2, pageSize: 10 },
      },
      4,
    );
  });

  it('maps nested detail fields and normalizes payment strings', async () => {
    vi.mocked(graphqlRequest).mockResolvedValue({
      invoice: graphqlInvoice({
        items: [{
          id: 3,
          invoiceId: 12,
          productId: null,
          name: 'Service',
          description: null,
          quantity: '2.00',
          unitPrice: '12.50',
          taxRate: '5.00',
          taxAmount: '1.25',
          discountAmount: '0.00',
          total: '26.25',
          sortOrder: 0,
          productName: null,
        }],
        payments: [{
          id: 5,
          amount: '10.00',
          currency: 'USD',
          paymentMethod: 'CASH',
          status: 'SUCCEEDED',
          notes: null,
          paidAt: '2026-07-18T13:00:00.000Z',
          createdAt: '2026-07-18T13:00:00.000Z',
        }],
      }),
    });
    await expect(getInvoiceViaGraphql(12, 4)).resolves.toMatchObject({
      items: [{ quantity: 2, unit_price: 12.5 }],
      payments: [{
        amount: 10,
        payment_method: 'cash',
        status: 'succeeded',
        refund_amount: 0,
      }],
    });
  });

  it('maps protected create/update/delete mutations', async () => {
    vi.mocked(graphqlMutationRequest)
      .mockResolvedValueOnce({ createInvoice: graphqlInvoice() })
      .mockResolvedValueOnce({ updateInvoice: graphqlInvoice() })
      .mockResolvedValueOnce({
        deleteInvoice: { success: true, deletedId: 12 },
      });
    const items = [{
      name: 'Service',
      quantity: 2,
      unit_price: 12.5,
      tax_rate: 5,
    }];
    await createInvoiceViaGraphql({
      items,
      discount_type: 'fixed',
      discount_value: 1,
      tax_rate: 8.25,
      payment_terms: 30,
    }, 4);
    await updateInvoiceViaGraphql(12, { notes: 'Updated', items }, 4);
    await expect(deleteInvoiceViaGraphql(12, 4))
      .resolves.toEqual({ success: true });
    expect(graphqlMutationRequest).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('mutation CreateInvoice'),
      {
        input: expect.objectContaining({
          items: [{
            name: 'Service',
            quantity: '2',
            unitPrice: '12.5',
            taxRate: '5',
          }],
          discountValue: '1',
          taxRate: '8.25',
          paymentTerms: '30',
        }),
      },
      4,
    );
    expect(graphqlMutationRequest).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('mutation DeleteInvoice'),
      { id: 12 },
      4,
    );
  });

  it('sends with a caller-stable key and reloads only confirmed delivery', async () => {
    vi.mocked(graphqlMutationRequest).mockResolvedValue({
      sendInvoice: { success: true, emailSent: true, status: 'SENT' },
    });
    vi.mocked(graphqlRequest).mockResolvedValue({
      invoice: graphqlInvoice({ status: 'sent' }),
    });
    await expect(sendInvoiceViaGraphql(12, {
      subject: 'Your invoice',
      message: 'Please pay.',
      ccEmails: ['owner@example.com'],
      includePaymentLink: true,
      resend: true,
    }, 4, 'stable-send-key')).resolves.toMatchObject({
      id: 12, status: 'sent', emailSent: true,
    });
    expect(graphqlMutationRequest).toHaveBeenCalledWith(
      expect.stringContaining('mutation SendInvoice'),
      {
        id: 12,
        input: {
          idempotencyKey: 'stable-send-key',
          subject: 'Your invoice',
          message: 'Please pay.',
          ccEmails: ['owner@example.com'],
          includePaymentLink: true,
          resend: true,
        },
      },
      4,
    );
  });

  it('rejects unconfirmed invoice delivery without reloading stale state', async () => {
    vi.mocked(graphqlMutationRequest).mockResolvedValue({
      sendInvoice: { success: false, emailSent: false, status: 'RETRY' },
    });
    await expect(sendInvoiceViaGraphql(12, {
      subject: 'Your invoice', message: 'Please pay.',
    }, 4, 'retry-key')).rejects.toThrow('not confirmed (RETRY)');
    expect(graphqlRequest).not.toHaveBeenCalled();
  });

  it('creates a payment link with a caller-stable idempotency key', async () => {
    vi.mocked(graphqlMutationRequest).mockResolvedValue({
      createInvoicePaymentLink: {
        success: true,
        status: 'READY',
        url: 'https://checkout.test/invoice',
        sessionId: 'cs_invoice',
      },
    });

    await expect(createInvoicePaymentLinkViaGraphql(
      12, 4, 'stable-payment-link-key',
    )).resolves.toEqual({
      url: 'https://checkout.test/invoice', session_id: 'cs_invoice',
    });
    expect(graphqlMutationRequest).toHaveBeenCalledWith(
      expect.stringContaining('mutation CreateInvoicePaymentLink'),
      { id: 12, input: { idempotencyKey: 'stable-payment-link-key' } },
      4,
    );
  });

  it('does not expose an unconfirmed payment link', async () => {
    vi.mocked(graphqlMutationRequest).mockResolvedValue({
      createInvoicePaymentLink: {
        success: false,
        status: 'RECONCILIATION_REQUIRED',
        url: null,
        sessionId: null,
      },
    });

    await expect(createInvoicePaymentLinkViaGraphql(
      12, 4, 'ambiguous-payment-link-key',
    )).rejects.toThrow('not confirmed (RECONCILIATION_REQUIRED)');
  });
});
