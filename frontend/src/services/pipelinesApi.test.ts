import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDeals, getPipeline, markDealWon } from './pipelinesApi';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  default: {
    get: mocks.get,
    post: mocks.post,
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('./graphqlClient', () => ({
  isDealGraphqlMutationsEnabled: () => false,
  isDealGraphqlReadsEnabled: () => false,
  isPipelineGraphqlMutationsEnabled: () => false,
  isPipelineGraphqlReadsEnabled: () => false,
}));

vi.mock('./pipelinesGraphql', () => ({
  createPipelineViaGraphql: vi.fn(),
  deletePipelineViaGraphql: vi.fn(),
  getPipelineViaGraphql: vi.fn(),
  getPipelinesViaGraphql: vi.fn(),
  updatePipelineViaGraphql: vi.fn(),
}));

vi.mock('./dealsGraphql', () => ({
  createDealViaGraphql: vi.fn(),
  deleteDealViaGraphql: vi.fn(),
  getDealViaGraphql: vi.fn(),
  getDealsViaGraphql: vi.fn(),
  markDealLostViaGraphql: vi.fn(),
  markDealWonViaGraphql: vi.fn(),
  moveDealViaGraphql: vi.fn(),
  reopenDealViaGraphql: vi.fn(),
  updateDealViaGraphql: vi.fn(),
}));

const restDeal = {
  id: 9,
  organization_id: 3,
  pipeline_id: 4,
  stage_id: 'lead',
  title: 'REST decimal',
  value: '9876.54',
  currency: 'USD',
  probability: 25,
  custom_fields: {},
  tags: [],
  created_at: '2026-07-17T00:00:00.000Z',
  updated_at: '2026-07-17T00:00:00.000Z',
};

describe('pipeline REST adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes PostgreSQL decimal strings in pipeline and deal reads', async () => {
    mocks.get
      .mockResolvedValueOnce({
        data: {
          id: 4,
          organization_id: 3,
          name: 'Sales',
          stages: [],
          is_default: true,
          total_value: '9876.54',
          deals: [restDeal],
          created_at: '2026-07-17T00:00:00.000Z',
          updated_at: '2026-07-17T00:00:00.000Z',
        },
      })
      .mockResolvedValueOnce({
        data: {
          deals: [restDeal],
          pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
        },
      });

    await expect(getPipeline(4, 3)).resolves.toEqual(
      expect.objectContaining({
        total_value: 9876.54,
        deals: [expect.objectContaining({ value: 9876.54 })],
      }),
    );
    await expect(getDeals({ organization_id: 3 })).resolves.toEqual(
      expect.objectContaining({
        deals: [expect.objectContaining({ value: 9876.54 })],
      }),
    );
  });

  it('normalizes PostgreSQL decimal strings returned by REST mutations', async () => {
    mocks.post.mockResolvedValue({ data: { ...restDeal, won_at: '2026-07-17T01:00:00.000Z' } });

    await expect(markDealWon(9, 3)).resolves.toEqual(
      expect.objectContaining({ value: 9876.54 }),
    );
  });
});
