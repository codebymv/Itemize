import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  convertEstimateToInvoice, createEstimate, deleteEstimate, getEstimate,
  getEstimates, sendEstimate, updateEstimate,
} from './estimatesApi';
import {
  convertEstimateToInvoiceViaGraphql, createEstimateViaGraphql,
  deleteEstimateViaGraphql, getEstimateViaGraphql, getEstimatesViaGraphql,
  sendEstimateViaGraphql,
  updateEstimateViaGraphql,
} from './estimatesGraphql';

vi.mock('./estimatesGraphql', () => ({
  convertEstimateToInvoiceViaGraphql: vi.fn(),
  createEstimateViaGraphql: vi.fn(),
  deleteEstimateViaGraphql: vi.fn(),
  getEstimateViaGraphql: vi.fn(),
  getEstimatesViaGraphql: vi.fn(),
  sendEstimateViaGraphql: vi.fn(),
  updateEstimateViaGraphql: vi.fn(),
}));

const estimate = {
  id: 8, organization_id: 4, estimate_number: 'EST-00008',
  issue_date: '2026-07-19', valid_until: '2026-08-18',
  subtotal: 20, tax_amount: 1, discount_amount: 0, discount_value: 0,
  total: 21, currency: 'USD', status: 'draft' as const,
  created_at: '2026-07-19T00:00:00.000Z',
  updated_at: '2026-07-19T00:00:00.000Z',
  items: [{ name: 'Service', quantity: 2, unit_price: 10, tax_rate: 5 }],
};

describe('estimate API transport selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('always routes CRUD and conversion through GraphQL', async () => {
    vi.mocked(getEstimatesViaGraphql).mockResolvedValue({
      estimates: [estimate],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    vi.mocked(getEstimateViaGraphql).mockResolvedValue(estimate);
    vi.mocked(createEstimateViaGraphql).mockResolvedValue(estimate);
    vi.mocked(updateEstimateViaGraphql).mockResolvedValue(estimate);
    vi.mocked(deleteEstimateViaGraphql).mockResolvedValue({ success: true });
    vi.mocked(convertEstimateToInvoiceViaGraphql).mockResolvedValue({
      invoice_id: 19,
      invoice_number: 'INV-00019',
    });
    await getEstimates({ search: 'EST' }, 4);
    await getEstimate(8, 4);
    await createEstimate({ items: estimate.items }, 4);
    await updateEstimate(8, { notes: 'Updated' }, 4);
    await deleteEstimate(8, 4);
    await expect(convertEstimateToInvoice(8, 4)).resolves.toEqual({
      invoice_id: 19,
      invoice_number: 'INV-00019',
    });
    expect(getEstimatesViaGraphql).toHaveBeenCalledWith({ search: 'EST' }, 4);
    expect(getEstimateViaGraphql).toHaveBeenCalledWith(8, 4);
    expect(createEstimateViaGraphql).toHaveBeenCalledWith(
      { items: estimate.items },
      4,
    );
    expect(updateEstimateViaGraphql).toHaveBeenCalledWith(
      8,
      { notes: 'Updated' },
      4,
    );
    expect(deleteEstimateViaGraphql).toHaveBeenCalledWith(8, 4);
    expect(convertEstimateToInvoiceViaGraphql).toHaveBeenCalledWith(8, 4);
  });

  it('routes sending through GraphQL without a REST fallback', async () => {
    vi.mocked(sendEstimateViaGraphql).mockResolvedValue();
    await sendEstimate(8, 4, 'estimate-send-8');
    expect(sendEstimateViaGraphql).toHaveBeenCalledWith(8, 4, 'estimate-send-8');
  });
});
