import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken } from '@/lib/api';
import {
  createPipelineViaGraphql,
  deletePipelineViaGraphql,
  getPipelineViaGraphql,
  getPipelinesViaGraphql,
  updatePipelineViaGraphql,
} from './pipelinesGraphql';

vi.mock('@/lib/api', () => ({
  fetchCsrfToken: vi.fn(),
  getApiUrl: vi.fn(() => 'https://api.test.itemize'),
  refreshAuthenticatedSession: vi.fn(),
}));

const pipeline = {
  id: 17,
  organizationId: 42,
  name: 'Sales',
  description: 'Primary board',
  stages: [
    { id: 'lead', name: 'Lead', order: 0, color: '#6B7280' },
  ],
  isDefault: true,
  createdById: 7,
  dealCount: 1,
  totalValue: 1250.5,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

const deal = {
  id: 91,
  organizationId: 42,
  pipelineId: 17,
  contactId: 11,
  stageId: 'lead',
  title: 'Expansion',
  value: 1250.5,
  currency: 'USD',
  probability: 40,
  expectedCloseDate: '2026-08-01',
  assignedToId: 7,
  assignedToName: 'Owner',
  createdById: 7,
  wonAt: null,
  lostAt: null,
  lostReason: null,
  customFields: { channel: 'partner' },
  tags: ['vip'],
  contactFirstName: 'Ada',
  contactLastName: 'Lovelace',
  contactEmail: 'ada@example.com',
  createdAt: '2026-01-03T00:00:00.000Z',
  updatedAt: '2026-01-04T00:00:00.000Z',
};

const response = (payload: unknown): Response => ({
  ok: true,
  status: 200,
  json: vi.fn().mockResolvedValue(payload),
} as unknown as Response);

describe('pipeline GraphQL consumer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(fetchCsrfToken).mockResolvedValue('pipeline-csrf');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('maps pipeline lists into the retained consumer shape', async () => {
    vi.mocked(fetch).mockResolvedValue(response({
      data: { pipelines: [pipeline] },
    }));

    await expect(getPipelinesViaGraphql(42)).resolves.toEqual([
      expect.objectContaining({
        id: 17,
        organization_id: 42,
        name: 'Sales',
        is_default: true,
        deal_count: 1,
        total_value: 1250.5,
        stages: [{ id: 'lead', name: 'Lead', order: 0, color: '#6B7280' }],
      }),
    ]);
    const request = vi.mocked(fetch).mock.calls[0];
    expect(request[1]).toMatchObject({
      credentials: 'include',
      headers: expect.objectContaining({ 'x-organization-id': '42' }),
    });
  });

  it('maps nested pipeline deals without changing the board contract', async () => {
    vi.mocked(fetch).mockResolvedValue(response({
      data: { pipeline: { ...pipeline, deals: [deal] } },
    }));

    await expect(getPipelineViaGraphql(17, 42)).resolves.toEqual(
      expect.objectContaining({
        id: 17,
        deals: [
          expect.objectContaining({
            id: 91,
            organization_id: 42,
            pipeline_id: 17,
            contact_id: 11,
            stage_id: 'lead',
            value: 1250.5,
            assigned_to_name: 'Owner',
            contact_first_name: 'Ada',
          }),
        ],
      }),
    );
  });

  it('maps create/update inputs and sends CSRF-protected mutations', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ data: { createPipeline: pipeline } }))
      .mockResolvedValueOnce(response({
        data: {
          updatePipeline: { ...pipeline, description: null, isDefault: false },
        },
      }))
      .mockResolvedValueOnce(response({
        data: { deletePipeline: { deletedId: pipeline.id } },
      }));

    await createPipelineViaGraphql({
      name: 'Sales',
      description: 'Primary board',
      stages: pipeline.stages,
      is_default: true,
      organization_id: 42,
    });
    await updatePipelineViaGraphql(17, {
      description: null,
      is_default: false,
      organization_id: 42,
    });
    await deletePipelineViaGraphql(17, 42);

    expect(fetchCsrfToken).toHaveBeenCalledTimes(3);
    const createRequest = JSON.parse(
      String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body),
    );
    expect(createRequest.variables.input).toEqual({
      name: 'Sales',
      description: 'Primary board',
      stages: pipeline.stages,
      isDefault: true,
    });
    const updateRequest = JSON.parse(
      String((vi.mocked(fetch).mock.calls[1][1] as RequestInit).body),
    );
    expect(updateRequest.variables).toEqual({
      id: 17,
      input: { description: null, isDefault: false },
    });
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({
      headers: expect.objectContaining({ 'x-csrf-token': 'pipeline-csrf' }),
    });
    const deleteRequest = JSON.parse(
      String((vi.mocked(fetch).mock.calls[2][1] as RequestInit).body),
    );
    expect(deleteRequest.variables).toEqual({ id: 17 });
  });
});
