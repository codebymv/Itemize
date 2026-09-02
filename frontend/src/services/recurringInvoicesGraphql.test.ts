import { beforeEach, describe, expect, it, vi } from 'vitest';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';
import {
  createRecurringInvoiceFromInvoiceViaGraphql,
  createRecurringInvoiceViaGraphql,
  deleteRecurringInvoiceViaGraphql,
  generateRecurringInvoiceNowViaGraphql,
  getRecurringInvoiceViaGraphql,
  getRecurringInvoiceHistoryViaGraphql,
  getRecurringInvoiceNumberPreviewViaGraphql,
  getRecurringInvoicePageViaGraphql,
  pauseRecurringInvoiceViaGraphql,
  resetRecurringInvoiceListCapability,
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
  beforeEach(() => {
    vi.clearAllMocks();
    resetRecurringInvoiceListCapability();
  });

  it('returns one bounded server-filtered page with global stats', async () => {
    vi.mocked(graphqlRequest).mockResolvedValueOnce({
      recurringInvoices: {
        nodes: [row()],
        pageInfo: { page: 2, pageSize: 20, total: 24, totalPages: 2 },
        stats: { total: 31, active: 24, paused: 5, completed: 2 },
      },
    });
    const result = await getRecurringInvoicePageViaGraphql({
      status: 'active', search: '  Ada  ', page: 2, limit: 20,
    }, 4);
    expect(result).toMatchObject({
      recurringInvoices: [{ template_name: 'Retainer', total: 26 }],
      pagination: { page: 2, limit: 20, total: 24, totalPages: 2 },
      stats: { total: 31, active: 24, paused: 5, completed: 2 },
    });
    expect(graphqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('stats { total active paused completed }'),
      {
        filter: { status: 'active', search: 'Ada' },
        page: { page: 2, pageSize: 20 },
      },
      4,
      undefined,
    );
    expect(graphqlRequest).toHaveBeenCalledTimes(1);
  });

  it('uses one bounded legacy page and derives global stats when stats are unavailable', async () => {
    const legacyData = {
      page: {
        nodes: [row(), row({
          id: 9,
          templateName: 'Studio plan',
          customerName: 'Bob',
          customerEmail: 'bob@example.com',
          contactFirstName: 'Bob',
          contactLastName: 'Stone',
          contactEmail: 'bob@example.com',
        })],
        pageInfo: { page: 1, pageSize: 100, total: 2, totalPages: 1 },
      },
      all: { pageInfo: { total: 9 } },
      active: { pageInfo: { total: 5 } },
      paused: { pageInfo: { total: 3 } },
      completed: { pageInfo: { total: 1 } },
    };
    vi.mocked(graphqlRequest)
      .mockRejectedValueOnce(new Error(
        'Cannot query field "stats" on type "RecurringInvoicePage".',
      ))
      .mockResolvedValueOnce(legacyData)
      .mockResolvedValueOnce(legacyData);

    await expect(getRecurringInvoicePageViaGraphql({
      status: 'active', search: '  ADA  ', page: 1, limit: 20,
    }, 4)).resolves.toMatchObject({
      recurringInvoices: [{ id: 8, template_name: 'Retainer' }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      stats: { total: 9, active: 5, paused: 3, completed: 1 },
    });
    expect(graphqlRequest).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('all: recurringInvoices'),
      {
        filter: { status: 'active' },
        page: { page: 1, pageSize: 100 },
        allFilter: {},
        activeFilter: { status: 'active' },
        pausedFilter: { status: 'paused' },
        completedFilter: { status: 'completed' },
        summaryPage: { page: 1, pageSize: 1 },
      },
      4,
      undefined,
    );

    await getRecurringInvoicePageViaGraphql({ status: 'all' }, 4);
    expect(graphqlRequest).toHaveBeenCalledTimes(3);
    expect(vi.mocked(graphqlRequest).mock.calls[2][0])
      .toContain('LegacyRecurringInvoicePage');
  });

  it('does not mask non-schema list failures with a compatibility request', async () => {
    vi.mocked(graphqlRequest).mockRejectedValueOnce(new Error('Network unavailable'));
    await expect(getRecurringInvoicePageViaGraphql({}, 4))
      .rejects.toThrow('Network unavailable');
    expect(graphqlRequest).toHaveBeenCalledTimes(1);
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
    }, 'recurring-create-8', 4);
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
      idempotencyKey: 'recurring-create-8',
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
      'recurring-clone-12',
      4,
    )).resolves.toEqual({ recurring_template_id: 42 });
    expect(graphqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('previewRecurringInvoiceNumber'),
      {},
      4,
      undefined,
    );
    expect(graphqlMutationRequest).toHaveBeenCalledWith(
      expect.stringContaining('createRecurringInvoiceFromInvoice'),
      {
        invoiceId: 12,
        idempotencyKey: 'recurring-clone-12',
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

  it('generates with an explicit idempotency key and maps the retained response', async () => {
    vi.mocked(graphqlMutationRequest).mockResolvedValueOnce({
      generateRecurringInvoiceNow: {
        invoiceId: 51,
        invoiceNumber: 'INV-00051',
        nextRunDate: '2026-08-20',
        templateStatus: 'active',
        replayed: false,
      },
    });
    await expect(generateRecurringInvoiceNowViaGraphql(
      8, 4, 'recurring-generation-request-1',
    )).resolves.toEqual({
      invoice_number: 'INV-00051',
      next_run_date: '2026-08-20',
      template_status: 'active',
      replayed: false,
    });
    expect(graphqlMutationRequest).toHaveBeenCalledWith(
      expect.stringContaining('generateRecurringInvoiceNow'),
      {
        id: 8,
        idempotencyKey: 'recurring-generation-request-1',
      },
      4,
    );
  });
});
