import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import {
  createEstimate, deleteEstimate, getEstimate, getEstimates, updateEstimate,
} from './estimatesApi';
import {
  isEstimateGraphqlMutationsEnabled, isEstimateGraphqlReadsEnabled,
} from './graphqlClient';
import {
  createEstimateViaGraphql, deleteEstimateViaGraphql, getEstimateViaGraphql,
  getEstimatesViaGraphql, updateEstimateViaGraphql,
} from './estimatesGraphql';

vi.mock('@/lib/api', () => ({
  default: { delete: vi.fn(), get: vi.fn(), post: vi.fn(), put: vi.fn() },
}));
vi.mock('./graphqlClient', () => ({
  isEstimateGraphqlMutationsEnabled: vi.fn(),
  isEstimateGraphqlReadsEnabled: vi.fn(),
}));
vi.mock('./estimatesGraphql', () => ({
  createEstimateViaGraphql: vi.fn(),
  deleteEstimateViaGraphql: vi.fn(),
  getEstimateViaGraphql: vi.fn(),
  getEstimatesViaGraphql: vi.fn(),
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
    vi.mocked(isEstimateGraphqlReadsEnabled).mockReturnValue(false);
    vi.mocked(isEstimateGraphqlMutationsEnabled).mockReturnValue(false);
  });

  it('keeps all five CRUD operations on REST by default', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: { estimates: [estimate], pagination: {} } })
      .mockResolvedValueOnce({ data: estimate });
    vi.mocked(api.post).mockResolvedValue({ data: estimate });
    vi.mocked(api.put).mockResolvedValue({ data: estimate });
    vi.mocked(api.delete).mockResolvedValue({ data: { success: true } });
    await getEstimates({}, 4);
    await getEstimate(8, 4);
    await createEstimate({ items: estimate.items }, 4);
    await updateEstimate(8, { notes: 'Updated' }, 4);
    await deleteEstimate(8, 4);
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(api.post).toHaveBeenCalledWith(
      '/api/invoices/estimates', { items: estimate.items },
      { headers: { 'x-organization-id': '4' } },
    );
    expect(createEstimateViaGraphql).not.toHaveBeenCalled();
  });

  it('routes reads and CRUD through independent GraphQL flags', async () => {
    vi.mocked(isEstimateGraphqlReadsEnabled).mockReturnValue(true);
    vi.mocked(isEstimateGraphqlMutationsEnabled).mockReturnValue(true);
    vi.mocked(getEstimatesViaGraphql).mockResolvedValue({
      estimates: [estimate],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    vi.mocked(getEstimateViaGraphql).mockResolvedValue(estimate);
    vi.mocked(createEstimateViaGraphql).mockResolvedValue(estimate);
    vi.mocked(updateEstimateViaGraphql).mockResolvedValue(estimate);
    vi.mocked(deleteEstimateViaGraphql).mockResolvedValue({ success: true });
    await getEstimates({ search: 'EST' }, 4);
    await getEstimate(8, 4);
    await createEstimate({ items: estimate.items }, 4);
    await updateEstimate(8, { notes: 'Updated' }, 4);
    await deleteEstimate(8, 4);
    expect(getEstimatesViaGraphql).toHaveBeenCalledWith({ search: 'EST' }, 4);
    expect(getEstimateViaGraphql).toHaveBeenCalledWith(8, 4);
    expect(updateEstimateViaGraphql).toHaveBeenCalledWith(
      8, { notes: 'Updated' }, 4,
    );
    expect(api.get).not.toHaveBeenCalled();
  });
});
