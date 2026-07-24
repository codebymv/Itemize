import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken } from '@/lib/api';
import {
  createLandingPageVersionViaGraphql,
  deleteLandingPageVersionViaGraphql,
  getLandingPageVersionViaGraphql,
  getLandingPageVersionsViaGraphql,
  publishLandingPageVersionViaGraphql,
  restoreLandingPageVersionViaGraphql,
} from './landingPageVersionsGraphql';

vi.mock('@/lib/api', () => ({
  fetchCsrfToken: vi.fn(),
  getApiUrl: vi.fn(() => 'https://api.test.itemize'),
  refreshAuthenticatedSession: vi.fn(),
}));

const version = {
  id: 31,
  pageId: 12,
  versionNumber: 3,
  content: { name: 'Launch', slug: 'launch', sections: [] },
  description: 'Before redesign',
  createdBy: 7,
  createdByName: 'Owner',
  publishedAt: null,
  isCurrent: false,
  createdAt: '2026-07-23T10:00:00.000Z',
};

const response = (payload: unknown): Response =>
  ({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(payload),
  }) as unknown as Response;

const bodies = () =>
  vi.mocked(fetch).mock.calls.map((call) =>
    JSON.parse(String((call[1] as RequestInit).body)) as {
      query: string;
      variables: Record<string, unknown>;
    });

describe('landing-page version GraphQL consumers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(fetchCsrfToken).mockResolvedValue('version-csrf');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('maps list/detail reads to the legacy frontend shape without CSRF', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        response({
          data: {
            landingPageVersions: {
              versions: [version],
              currentVersionId: 31,
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        response({ data: { landingPageVersion: version } }),
      );

    await expect(getLandingPageVersionsViaGraphql(12, 4)).resolves.toEqual({
      versions: [
        expect.objectContaining({
          id: 31,
          page_id: 12,
          version_number: 3,
          created_by_name: 'Owner',
        }),
      ],
      currentVersionId: 31,
    });
    await expect(getLandingPageVersionViaGraphql(12, 31, 4)).resolves.toEqual(
      expect.objectContaining({ id: 31, description: 'Before redesign' }),
    );
    expect(fetchCsrfToken).not.toHaveBeenCalled();
    expect(bodies().map(({ variables }) => variables)).toEqual([
      { pageId: 12 },
      { pageId: 12, versionId: 31 },
    ]);
  });

  it('uses protected mutations for create, publish, restore, and delete', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        response({ data: { createLandingPageVersion: version } }),
      )
      .mockResolvedValueOnce(
        response({
          data: {
            publishLandingPageVersion: {
              ...version,
              publishedAt: '2026-07-23T11:00:00.000Z',
              isCurrent: true,
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        response({
          data: {
            restoreLandingPageVersion: {
              ...version,
              id: 32,
              versionNumber: 104,
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        response({ data: { deleteLandingPageVersion: { deletedId: 32 } } }),
      );

    await createLandingPageVersionViaGraphql(12, 'Snapshot', 4);
    await publishLandingPageVersionViaGraphql(12, 31, 4);
    await restoreLandingPageVersionViaGraphql(12, 31, 4);
    await expect(
      deleteLandingPageVersionViaGraphql(12, 32, 4),
    ).resolves.toEqual({ success: true });

    expect(bodies().map(({ query }) => query)).toEqual([
      expect.stringContaining('createLandingPageVersion'),
      expect.stringContaining('publishLandingPageVersion'),
      expect.stringContaining('restoreLandingPageVersion'),
      expect.stringContaining('deleteLandingPageVersion'),
    ]);
    expect(bodies()[0].variables).toEqual({
      pageId: 12,
      description: 'Snapshot',
    });
    expect(fetchCsrfToken).toHaveBeenCalledTimes(4);
    for (const call of vi.mocked(fetch).mock.calls) {
      expect((call[1] as RequestInit).headers).toMatchObject({
        'x-organization-id': '4',
        'x-csrf-token': 'version-csrf',
      });
    }
  });
});
