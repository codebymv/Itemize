import { beforeEach, describe, expect, it, vi } from 'vitest';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';
import {
  createEstimateViaGraphql, deleteEstimateViaGraphql,
  getEstimateViaGraphql, getEstimatesViaGraphql,
} from './estimatesGraphql';

vi.mock('./graphqlClient', () => ({
  graphqlMutationRequest: vi.fn(),
  graphqlRequest: vi.fn(),
}));

const row = (extra: Record<string, unknown> = {}) => ({
  id: 8, organizationId: 4, estimateNumber: 'EST-00008',
  contactId: 9, businessId: null, customerName: 'Ada',
  customerEmail: null, customerPhone: null, customerAddress: null,
  issueDate: '2026-07-19', validUntil: '2026-08-18',
  subtotal: '25.00', taxAmount: '2.00', discountAmount: '1.00',
  discountType: 'fixed', discountValue: '1.00', total: '26.00',
  currency: 'USD', status: 'draft', notes: null, termsAndConditions: null,
  sentAt: null, viewedAt: null, acceptedAt: null, declinedAt: null,
  convertedInvoiceId: null, customFields: {}, createdById: 7,
  createdAt: '2026-07-19T00:00:00.000Z',
  updatedAt: '2026-07-19T00:00:00.000Z',
  contactFirstName: 'Ada', contactLastName: 'Lovelace',
  contactEmail: 'ada@example.com', ...extra,
});

describe('estimate GraphQL adapter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps list filters, pagination, and decimals', async () => {
    vi.mocked(graphqlRequest).mockResolvedValue({
      estimates: {
        nodes: [row()],
        pageInfo: { page: 2, pageSize: 10, total: 21, totalPages: 3 },
      },
    });
    const result = await getEstimatesViaGraphql({
      status: 'draft', contact_id: 9, search: 'Ada', page: 2, limit: 10,
    }, 4);
    expect(result.estimates[0]).toMatchObject({
      estimate_number: 'EST-00008', subtotal: 25, total: 26,
    });
    expect(result.pagination).toEqual({ page: 2, limit: 10, total: 21, totalPages: 3 });
    expect(vi.mocked(graphqlRequest).mock.calls[0][1]).toEqual({
      filter: { status: 'draft', contactId: 9, search: 'Ada' },
      page: { page: 2, pageSize: 10 },
    });
  });

  it('maps nested detail and protected create/delete mutations', async () => {
    vi.mocked(graphqlRequest).mockResolvedValue({
      estimate: row({
        items: [{
          id: 1, estimateId: 8, organizationId: 4, productId: null,
          productName: null, name: 'Service', description: null,
          quantity: '2.00', unitPrice: '12.50', taxRate: '8.00',
          taxAmount: '2.00', discountAmount: '0.00', total: '27.00',
          sortOrder: 0, createdAt: '2026-07-19T00:00:00.000Z',
          updatedAt: '2026-07-19T00:00:00.000Z',
        }],
      }),
    });
    expect((await getEstimateViaGraphql(8, 4)).items?.[0]).toMatchObject({
      quantity: 2, unit_price: 12.5, tax_amount: 2,
    });
    vi.mocked(graphqlMutationRequest)
      .mockResolvedValueOnce({ createEstimate: row() })
      .mockResolvedValueOnce({ deleteEstimate: { success: true, deletedId: 8 } });
    await createEstimateViaGraphql({
      contact_id: 9,
      discount_type: 'fixed',
      discount_value: 1,
      items: [{ name: 'Service', quantity: 2, unit_price: 12.5, tax_rate: 8 }],
    }, 4);
    expect(vi.mocked(graphqlMutationRequest).mock.calls[0][1]).toEqual({
      input: {
        contactId: 9, discountType: 'fixed', discountValue: '1',
        items: [{ name: 'Service', quantity: '2', unitPrice: '12.5', taxRate: '8' }],
      },
    });
    await expect(deleteEstimateViaGraphql(8, 4)).resolves.toEqual({ success: true });
  });
});
