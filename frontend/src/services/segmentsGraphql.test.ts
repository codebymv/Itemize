import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken } from '@/lib/api';
import {
  createSegmentViaGraphql,
  deleteSegmentViaGraphql,
  getSegmentFilterOptionsViaGraphql,
  getSegmentsViaGraphql,
  previewSegmentViaGraphql,
} from './segmentsGraphql';
import { isSegmentsGraphqlEnabled } from './graphqlClient';

vi.mock('@/lib/api', () => ({
  fetchCsrfToken: vi.fn(),
  getApiUrl: vi.fn(() => 'https://api.test.itemize'),
  refreshAuthenticatedSession: vi.fn(),
}));

const segment = {
  id: 7, organizationId: 3, name: 'Active contacts', description: null,
  color: '#6366F1', icon: 'users', filterType: 'and',
  filters: [{ field: 'status', operator: 'equals', value: 'active' }],
  segmentType: 'dynamic', staticContactIds: [], contactCount: 2,
  lastCalculatedAt: '2026-07-21T00:00:00.000Z', isActive: true,
  usedInCampaigns: 0, usedInAutomations: 0, createdById: 5,
  createdByName: 'Owner', createdAt: '2026-07-21T00:00:00.000Z',
  updatedAt: '2026-07-21T00:00:01.000Z', history: [],
};

const response = (payload: unknown): Response => ({
  ok: true, status: 200, json: vi.fn().mockResolvedValue(payload),
}) as unknown as Response;

describe('segments GraphQL consumer', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(fetchCsrfToken).mockResolvedValue('segment-csrf');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('is default-off and can be enabled as one rollback boundary', () => {
    vi.stubEnv('VITE_SEGMENTS_GRAPHQL', 'false');
    expect(isSegmentsGraphqlEnabled()).toBe(false);
    vi.stubEnv('VITE_SEGMENTS_GRAPHQL', 'true');
    expect(isSegmentsGraphqlEnabled()).toBe(true);
  });

  it('maps bounded list and dynamic filter casing to the REST contract', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ data: {
      segments: { nodes: [segment], pageInfo: { page: 1, totalPages: 1 } },
    } }));
    await expect(getSegmentsViaGraphql({ is_active: true, search: 'active' }, 3)).resolves.toEqual([
      expect.objectContaining({
        id: 7, organization_id: 3, segment_type: 'dynamic', filter_type: 'and',
        contact_count: 2, is_active: true,
      }),
    ]);
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.variables).toEqual({
      filter: { isActive: true, search: 'active' }, page: { page: 1, pageSize: 100 },
    });
    expect((init.headers as Record<string, string>)['x-organization-id']).toBe('3');
  });

  it('walks every bounded list page so the retained array is never truncated', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ data: {
        segments: { nodes: [segment], pageInfo: { page: 1, totalPages: 2 } },
      } }))
      .mockResolvedValueOnce(response({ data: {
        segments: { nodes: [{ ...segment, id: 8, name: 'Second' }], pageInfo: { page: 2, totalPages: 2 } },
      } }));
    const result = await getSegmentsViaGraphql({}, 3);
    expect(result.map((item) => item.id)).toEqual([7, 8]);
    const second = JSON.parse(String((vi.mocked(fetch).mock.calls[1][1] as RequestInit).body));
    expect(second.variables.page).toEqual({ page: 2, pageSize: 100 });
  });

  it('maps mutations, obtains CSRF, and verifies delete identity', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ data: { createSegment: segment } }))
      .mockResolvedValueOnce(response({ data: { deleteSegment: { deletedId: 7 } } }));
    await createSegmentViaGraphql({
      name: 'Active contacts', segment_type: 'dynamic', filter_type: 'and',
      filters: [{ field: 'custom_field', operator: 'equals', value: 'gold', custom_field_key: 'tier' }],
    }, 3);
    await expect(deleteSegmentViaGraphql(7, 3)).resolves.toEqual({ success: true });
    const bodies = vi.mocked(fetch).mock.calls.map((call) => JSON.parse(String((call[1] as RequestInit).body)));
    expect(bodies[0].variables.input.filters[0]).toEqual({
      field: 'custom_field', operator: 'equals', value: 'gold', customFieldKey: 'tier',
    });
    expect(fetchCsrfToken).toHaveBeenCalledTimes(2);
  });

  it('maps preview and filter vocabulary without null optional choices', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ data: { previewSegment: {
        count: 1, sample: [{ id: 2, firstName: 'A', lastName: null, email: 'a@test', status: 'active' }],
      } } }))
      .mockResolvedValueOnce(response({ data: { segmentFilterOptions: {
        fields: [{ id: 'source', label: 'Source', type: 'text', operators: ['equals'], options: null }],
        tags: [], users: [], pipelines: [],
      } } }));
    await expect(previewSegmentViaGraphql([
      { field: 'status', operator: 'equals', value: 'active' },
    ], 'and', 3)).resolves.toEqual({
      count: 1, sample: [{ id: 2, first_name: 'A', last_name: undefined, email: 'a@test', status: 'active' }],
    });
    await expect(getSegmentFilterOptionsViaGraphql(3)).resolves.toEqual({
      fields: [{ id: 'source', label: 'Source', type: 'text', operators: ['equals'] }],
      tags: [], users: [], pipelines: [],
    });
  });
});
