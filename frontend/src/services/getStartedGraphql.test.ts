import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken } from '@/lib/api';
import {
  dismissGetStartedViaGraphql,
  getStartedProgressViaGraphql,
} from './getStartedGraphql';

vi.mock('@/lib/api', () => ({
  fetchCsrfToken: vi.fn(),
  getApiUrl: vi.fn(() => 'https://api.test.itemize'),
  refreshAuthenticatedSession: vi.fn(),
}));

const progress = {
  dismissed: false,
  completedCount: 2,
  totalCount: 4,
  steps: [
    { id: 'workspace_ready', completed: true, completedAt: null, href: '/settings' },
    { id: 'first_contact', completed: true, completedAt: '2026-08-01T00:00:00.000Z', href: '/contacts' },
    { id: 'first_workspace_item', completed: false, completedAt: null, href: '/canvas' },
    { id: 'first_money', completed: false, completedAt: null, href: '/invoices/new' },
  ],
};

const response = (payload: unknown): Response =>
  ({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(payload),
  }) as unknown as Response;

describe('get started GraphQL consumer', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(fetchCsrfToken).mockResolvedValue('get-started-csrf');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('reads organization-scoped progress', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      response({ data: { getStartedProgress: progress } }),
    );
    await expect(getStartedProgressViaGraphql()).resolves.toEqual(progress);
  });

  it('dismisses with CSRF', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      response({ data: { dismissGetStarted: { ...progress, dismissed: true } } }),
    );
    await expect(dismissGetStartedViaGraphql()).resolves.toMatchObject({
      dismissed: true,
    });
    expect(fetchCsrfToken).toHaveBeenCalled();
  });
});
