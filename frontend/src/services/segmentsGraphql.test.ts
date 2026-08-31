import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken } from '@/lib/api';
import {
  createSegmentViaGraphql,
  deleteSegmentViaGraphql,
  getSegmentEditorBootstrapViaGraphql,
  getSegmentFilterOptionsViaGraphql,
  getSegmentPageViaGraphql,
  previewSegmentViaGraphql,
  resetSegmentListCapability,
} from './segmentsGraphql';

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
    resetSegmentListCapability();
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(fetchCsrfToken).mockResolvedValue('segment-csrf');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('maps bounded list and dynamic filter casing to the REST contract', async () => {
    const controller = new AbortController();
    vi.mocked(fetch).mockResolvedValueOnce(response({ data: {
      segments: {
        nodes: [segment],
        pageInfo: { page: 2, pageSize: 20, total: 21, totalPages: 2 },
        stats: { total: 8, dynamic: 5, staticCount: 3, contacts: 41 },
      },
    } }));
    await expect(getSegmentPageViaGraphql(
      { is_active: true, search: ' active ', page: 2, limit: 20 }, 3, controller.signal,
    )).resolves.toMatchObject({
      segments: [expect.objectContaining({
        id: 7, organization_id: 3, segment_type: 'dynamic', filter_type: 'and',
        contact_count: 2, is_active: true,
      })],
      pagination: { page: 2, limit: 20, total: 21, totalPages: 2 },
      stats: { total: 8, dynamic: 5, staticCount: 3, contacts: 41 },
    });
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.variables).toEqual({
      filter: { isActive: true, search: 'active' }, page: { page: 2, pageSize: 20 },
    });
    expect((init.headers as Record<string, string>)['x-organization-id']).toBe('3');
    expect(init.signal).toBe(controller.signal);
  });

  it('negotiates legacy stats once and only walks legacy summary pages', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ errors: [{
        message: 'Cannot query field "stats" on type "SegmentPage".',
      }] }))
      .mockResolvedValueOnce(response({ data: {
        filtered: {
          nodes: [segment],
          pageInfo: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        },
        summary: {
          nodes: [{ segmentType: 'dynamic', contactCount: 2 }],
          pageInfo: { page: 1, total: 2, totalPages: 2 },
        },
      } }))
      .mockResolvedValueOnce(response({ data: {
        summary: {
          nodes: [{ segmentType: 'static', contactCount: 3 }],
          pageInfo: { page: 2, total: 2, totalPages: 2 },
        },
      } }));
    const result = await getSegmentPageViaGraphql({ page: 1, limit: 20 }, 3);
    expect(result).toMatchObject({
      segments: [{ id: 7 }],
      stats: { total: 2, dynamic: 1, staticCount: 1, contacts: 5 },
    });
    const operations = vi.mocked(fetch).mock.calls.map(([, init]) => {
      const body = JSON.parse(String((init as RequestInit).body));
      return String(body.query).match(/query\s+([A-Za-z0-9_]+)/)?.[1];
    });
    expect(operations).toEqual(['SegmentPage', 'LegacySegmentPage', 'LegacySegmentSummary']);
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

  it('loads existing editor detail and filter vocabulary in one cancellable operation', async () => {
    const controller = new AbortController();
    vi.mocked(fetch).mockResolvedValueOnce(response({ data: {
      segment,
      segmentFilterOptions: {
        fields: [{ id: 'status', label: 'Status', type: 'select', operators: ['equals'], options: ['active'] }],
        tags: [], users: [], pipelines: [],
      },
    } }));

    await expect(getSegmentEditorBootstrapViaGraphql(3, 7, controller.signal)).resolves.toMatchObject({
      segment: { id: 7, name: 'Active contacts' },
      filterOptions: { fields: [{ id: 'status', options: ['active'] }] },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.query).toContain('query SegmentEditorBootstrap($segmentId: Int!)');
    expect(body.query).toContain('segmentFilterOptions');
    expect(body.variables).toEqual({ segmentId: 7 });
    expect(init.signal).toBe(controller.signal);
  });

  it('prepares a new segment editor without requesting nonexistent detail', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ data: {
      segmentFilterOptions: { fields: [], tags: [], users: [], pipelines: [] },
    } }));

    await expect(getSegmentEditorBootstrapViaGraphql(3, null)).resolves.toEqual({
      segment: null,
      filterOptions: { fields: [], tags: [], users: [], pipelines: [] },
    });
    const body = JSON.parse(String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body));
    expect(body.query).toContain('query SegmentEditorBootstrap');
    expect(body.query).not.toContain('segment(id:');
  });
});
