import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken } from '@/lib/api';
import {
  createDealViaGraphql,
  deleteDealViaGraphql,
  getDealViaGraphql,
  getDealsViaGraphql,
  markDealLostViaGraphql,
  markDealWonViaGraphql,
  moveDealViaGraphql,
  reopenDealViaGraphql,
  updateDealViaGraphql,
} from './dealsGraphql';

vi.mock('@/lib/api', () => ({
  fetchCsrfToken: vi.fn(),
  getApiUrl: vi.fn(() => 'https://api.test.itemize'),
  refreshAuthenticatedSession: vi.fn(),
}));

const deal = {
  id: 91, organizationId: 42, pipelineId: 17, contactId: 11,
  stageId: 'lead', title: 'Expansion', value: '1250.50', currency: 'USD',
  probability: 40, expectedCloseDate: '2026-08-01', assignedToId: 7,
  assignedToName: 'Owner', createdById: 7, wonAt: null, lostAt: null,
  lostReason: null, customFields: { channel: 'partner' }, tags: ['vip'],
  contactFirstName: 'Ada', contactLastName: 'Lovelace',
  contactEmail: 'ada@example.com', contactCompany: 'Analytical Engines',
  pipelineName: 'Sales', createdAt: '2026-01-03T00:00:00.000Z',
  updatedAt: '2026-01-04T00:00:00.000Z',
};
const response = (payload: unknown): Response => ({
  ok: true, status: 200, json: vi.fn().mockResolvedValue(payload),
} as unknown as Response);

describe('deal GraphQL consumer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(fetchCsrfToken).mockResolvedValue('deal-csrf');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('maps filtering, stable paging, decimals, and joined fields', async () => {
    vi.mocked(fetch).mockResolvedValue(response({
      data: {
        deals: {
          nodes: [deal],
          pageInfo: { page: 2, pageSize: 10, total: 11, totalPages: 2 },
        },
      },
    }));
    await expect(getDealsViaGraphql({
      pipeline_id: 17,
      status: 'open',
      sort_by: 'value',
      sort_order: 'asc',
      page: 2,
      limit: 10,
      organization_id: 42,
    })).resolves.toEqual({
      deals: [expect.objectContaining({
        id: 91,
        value: 1250.5,
        contact_email: 'ada@example.com',
        pipeline_name: 'Sales',
      })],
      pagination: { page: 2, limit: 10, total: 11, totalPages: 2 },
    });
    const request = JSON.parse(String(
      (vi.mocked(fetch).mock.calls[0][1] as RequestInit).body,
    ));
    expect(request.variables).toEqual({
      filter: { pipelineId: 17, status: 'OPEN' },
      sort: { field: 'VALUE', direction: 'ASC' },
      page: { page: 2, pageSize: 10 },
    });
  });

  it('maps create/update input and preserves explicit clears', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ data: { createDeal: deal } }))
      .mockResolvedValueOnce(response({ data: { updateDeal: deal } }));
    await createDealViaGraphql({
      pipeline_id: 17,
      title: 'Expansion',
      value: 1250.5,
      organization_id: 42,
    }, 'deal-create-1');
    await updateDealViaGraphql(91, {
      contact_id: undefined,
      expected_close_date: undefined,
      custom_fields: undefined,
      tags: undefined,
      organization_id: 42,
    });
    const createBody = JSON.parse(String(
      (vi.mocked(fetch).mock.calls[0][1] as RequestInit).body,
    ));
    expect(createBody.variables.input).toEqual({
      pipelineId: 17,
      title: 'Expansion',
      value: '1250.5',
    });
    expect(createBody.variables.idempotencyKey).toBe('deal-create-1');
    const updateBody = JSON.parse(String(
      (vi.mocked(fetch).mock.calls[1][1] as RequestInit).body,
    ));
    expect(updateBody.variables.input).toEqual({
      contactId: null,
      expectedCloseDate: null,
      customFields: null,
      tags: null,
    });
    expect(fetchCsrfToken).toHaveBeenCalledTimes(2);
  });

  it('uses CSRF-protected stage and lifecycle mutations', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ data: { moveDeal: deal } }))
      .mockResolvedValueOnce(response({
        data: { markDealLost: { ...deal, lostAt: '2026-07-17T00:00:00Z' } },
      }));
    await moveDealViaGraphql(91, 'qualified', 42);
    await markDealLostViaGraphql(91, 'Budget', 42);
    const moveBody = JSON.parse(String(
      (vi.mocked(fetch).mock.calls[0][1] as RequestInit).body,
    ));
    const lostBody = JSON.parse(String(
      (vi.mocked(fetch).mock.calls[1][1] as RequestInit).body,
    ));
    expect(moveBody.variables).toEqual({ id: 91, stageId: 'qualified' });
    expect(lostBody.variables).toEqual({ id: 91, reason: 'Budget' });
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({
      headers: expect.objectContaining({ 'x-csrf-token': 'deal-csrf' }),
    });
  });

  it('maps detail and completes won, reopen, and delete operations', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ data: { deal } }))
      .mockResolvedValueOnce(response({
        data: { markDealWon: { ...deal, wonAt: '2026-07-17T00:00:00Z' } },
      }))
      .mockResolvedValueOnce(response({ data: { reopenDeal: deal } }))
      .mockResolvedValueOnce(response({
        data: { deleteDeal: { deletedId: deal.id } },
      }));

    await expect(getDealViaGraphql(91, 42)).resolves.toEqual(
      expect.objectContaining({
        id: 91,
        organization_id: 42,
        pipeline_id: 17,
        value: 1250.5,
      }),
    );
    await expect(markDealWonViaGraphql(91, 42)).resolves.toEqual(
      expect.objectContaining({ id: 91, won_at: '2026-07-17T00:00:00Z' }),
    );
    await expect(reopenDealViaGraphql(91, 42)).resolves.toEqual(
      expect.objectContaining({ id: 91 }),
    );
    await expect(deleteDealViaGraphql(91, 42)).resolves.toBeUndefined();

    expect(fetchCsrfToken).toHaveBeenCalledTimes(3);
    const requestBodies = vi.mocked(fetch).mock.calls.map((call) =>
      JSON.parse(String((call[1] as RequestInit).body)),
    );
    expect(requestBodies.map((body) => body.variables)).toEqual([
      { id: 91 },
      { id: 91 },
      { id: 91 },
      { id: 91 },
    ]);
  });
});
