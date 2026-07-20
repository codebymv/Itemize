import { beforeEach, describe, expect, it, vi } from 'vitest';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';
import {
  createRecurringInvoiceFromInvoiceViaGraphql,
  createRecurringInvoiceViaGraphql,
  deleteRecurringInvoiceViaGraphql,
  getRecurringInvoiceViaGraphql,
  getRecurringInvoiceHistoryViaGraphql,
  getRecurringInvoiceNumberPreviewViaGraphql,
  getRecurringInvoicesViaGraphql,
  pauseRecurringInvoiceViaGraphql,
  resumeRecurringInvoiceViaGraphql,
  updateRecurringInvoiceViaGraphql,
} from './recurringInvoicesGraphql';

vi.mock('./graphqlClient', () => ({
  graphqlMutationRequest: vi.fn(),
  graphqlRequest: vi.fn(),
}));

const row = (extra: Record<string, unknown> = {}) => ({
  id: 8, organizationId: 4, templateName: 'Retainer', contactId: 9,
  customerName: 'Ada', customerEmail: 'ada@example.com',
  frequency: 'monthly', startDate: '2026-07-20', endDate: null,
  nextRunDate: '2026-07-20', lastGeneratedAt: null, status: 'active',
  subtotal: '25.00', taxAmount: '2.00', discountAmount: '1.00',
  discountType: 'fixed', discountValue: '1.00', total: '26.00',
  currency: 'USD', notes: null, paymentTerms: null, customFields: {},
  sourceInvoiceId: null, createdById: 7,
  createdAt: '2026-07-19T00:00:00.000Z',
  updatedAt: '2026-07-19T00:00:00.000Z',
  contactFirstName: 'Ada', contactLastName: 'Lovelace',
  contactEmail: 'ada@example.com', sourceInvoiceNumber: null,
  invoicesGenerated: 0, ...extra,
});

describe('recurring invoice GraphQL adapter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('walks every page and maps decimal strings into the retained list', async () => {
    vi.mocked(graphqlRequest)
      .mockResolvedValueOnce({
        recurringInvoices: { nodes: [row()], pageInfo: { totalPages: 2 } },
      })
      .mockResolvedValueOnce({
        recurringInvoices: {
          nodes: [row({ id: 9, templateName: 'Second' })],
          pageInfo: { totalPages: 2 },
        },
      });
    const result = await getRecurringInvoicesViaGraphql('active', 4);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ template_name: 'Retainer', total: 26 });
    expect(vi.mocked(graphqlRequest).mock.calls.map((call) => call[1])).toEqual([
      { filter: { status: 'active' }, page: { page: 1, pageSize: 100 } },
      { filter: { status: 'active' }, page: { page: 2, pageSize: 100 } },
    ]);
  });

  it('maps detail and protected create/update/delete inputs', async () => {
    vi.mocked(graphqlRequest).mockResolvedValue({
      recurringInvoice: row({
        items: [{
          productId: 3, name: 'Service', description: null,
          quantity: '2', unitPrice: '12.50', taxRate: '8',
        }],
      }),
    });
    expect((await getRecurringInvoiceViaGraphql(8, 4)).items?.[0]).toMatchObject({
      product_id: 3, quantity: 2, unit_price: 12.5,
    });
    vi.mocked(graphqlMutationRequest)
      .mockResolvedValueOnce({ createRecurringInvoice: row() })
      .mockResolvedValueOnce({ updateRecurringInvoice: row() })
      .mockResolvedValueOnce({
        deleteRecurringInvoice: { success: true, deletedId: 8 },
      });
    await createRecurringInvoiceViaGraphql({
      template_name: 'Retainer', frequency: 'monthly', start_date: '2026-07-20',
      discount_type: 'fixed', discount_value: 1,
      items: [{ product_id: 3, name: 'Service', quantity: 2, unit_price: 12.5 }],
    }, 4);
    await updateRecurringInvoiceViaGraphql(8, { end_date: null, notes: '' }, 4);
    expect(vi.mocked(graphqlMutationRequest).mock.calls[0][1]).toEqual({
      input: {
        templateName: 'Retainer', frequency: 'monthly', startDate: '2026-07-20',
        discountType: 'fixed', discountValue: '1',
        items: [{
          productId: 3, name: 'Service', quantity: '2',
          unitPrice: '12.5', taxRate: '0',
        }],
      },
    });
    expect(vi.mocked(graphqlMutationRequest).mock.calls[1][1]).toEqual({
      id: 8, input: { endDate: null, notes: '' },
    });
    await expect(deleteRecurringInvoiceViaGraphql(8, 4))
      .resolves.toEqual({ success: true });
  });

  it('walks history pages and sends protected lifecycle mutations', async () => {
    vi.mocked(graphqlRequest)
      .mockResolvedValueOnce({
        recurringInvoiceHistory: {
          nodes: [{
            id: 14,
            invoiceNumber: 'INV-00014',
            total: '42.50',
            status: 'sent',
            createdAt: '2026-07-19T00:00:00.000Z',
          }],
          pageInfo: { totalPages: 2 },
        },
      })
      .mockResolvedValueOnce({
        recurringInvoiceHistory: {
          nodes: [{
            id: 13,
            invoiceNumber: 'INV-00013',
            total: '20.00',
            status: 'paid',
            createdAt: '2026-06-19T00:00:00.000Z',
          }],
          pageInfo: { totalPages: 2 },
        },
      });
    await expect(getRecurringInvoiceHistoryViaGraphql(8, 4)).resolves.toEqual([
      expect.objectContaining({ invoice_number: 'INV-00014', total: 42.5 }),
      expect.objectContaining({ invoice_number: 'INV-00013', total: 20 }),
    ]);
    expect(vi.mocked(graphqlRequest).mock.calls.map((call) => call[1])).toEqual([
      { id: 8, page: { page: 1, pageSize: 100 } },
      { id: 8, page: { page: 2, pageSize: 100 } },
    ]);
    vi.mocked(graphqlMutationRequest)
      .mockResolvedValueOnce({
        pauseRecurringInvoice: row({ status: 'paused' }),
      })
      .mockResolvedValueOnce({
        resumeRecurringInvoice: row({ status: 'active' }),
      });
    await expect(pauseRecurringInvoiceViaGraphql(8, 4))
      .resolves.toMatchObject({ id: 8, status: 'paused' });
    await expect(resumeRecurringInvoiceViaGraphql(8, 4))
      .resolves.toMatchObject({ id: 8, status: 'active' });
    expect(vi.mocked(graphqlMutationRequest).mock.calls.map((call) => call[1]))
      .toEqual([{ id: 8 }, { id: 8 }]);
  });

  it('previews without reserving and maps invoice cloning to the retained ID shape', async () => {
    vi.mocked(graphqlRequest)
      .mockResolvedValueOnce({ previewRecurringInvoiceNumber: 'ACME-00042' });
    vi.mocked(graphqlMutationRequest)
      .mockResolvedValueOnce({ createRecurringInvoiceFromInvoice: { id: 42 } });
    await expect(getRecurringInvoiceNumberPreviewViaGraphql(4))
      .resolves.toBe('ACME-00042');
    await expect(createRecurringInvoiceFromInvoiceViaGraphql(
      12,
      {
        template_name: 'Monthly support',
        frequency: 'monthly',
        start_date: '2026-07-21',
        end_date: '2026-12-21',
      },
      4,
    )).resolves.toEqual({ recurring_template_id: 42 });
    expect(graphqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('previewRecurringInvoiceNumber'),
      {},
      4,
    );
    expect(graphqlMutationRequest).toHaveBeenCalledWith(
      expect.stringContaining('createRecurringInvoiceFromInvoice'),
      {
        invoiceId: 12,
        input: {
          templateName: 'Monthly support',
          frequency: 'monthly',
          startDate: '2026-07-21',
          endDate: '2026-12-21',
        },
      },
      4,
    );
  });
});
