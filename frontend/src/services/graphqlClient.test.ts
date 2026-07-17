import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken, refreshAuthenticatedSession } from '@/lib/api';
import { GraphqlRequestError, graphqlMutationRequest, graphqlRequest } from './graphqlClient';

vi.mock('@/lib/api', () => ({
  getApiUrl: vi.fn(() => 'https://api.test.itemize'),
  fetchCsrfToken: vi.fn(),
  refreshAuthenticatedSession: vi.fn(),
}));

const response = (payload: unknown, status = 200): Response => ({
  ok: status >= 200 && status < 300,
  status,
  json: vi.fn().mockResolvedValue(payload),
} as unknown as Response);

describe('GraphQL session recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(refreshAuthenticatedSession).mockResolvedValue();
    vi.mocked(fetchCsrfToken).mockResolvedValue('csrf-test-token');
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://api.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('refreshes once and retries an operation after UNAUTHENTICATED', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({
        data: null,
        errors: [{ message: 'Authentication required', extensions: { code: 'UNAUTHENTICATED' } }],
      }))
      .mockResolvedValueOnce(response({ data: { readiness: 'ready' } }));

    await expect(graphqlRequest('query { readiness }', {}, 42))
      .resolves.toEqual({ readiness: 'ready' });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(refreshAuthenticatedSession).toHaveBeenCalledTimes(1);
  });

  it('fails after one refresh attempt when the refresh cookie is invalid', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({
      data: null,
      errors: [{ message: 'Authentication required', extensions: { code: 'UNAUTHENTICATED' } }],
    }));
    vi.mocked(refreshAuthenticatedSession).mockRejectedValue({ response: { status: 401 } });

    await expect(graphqlRequest('query { readiness }', {}, 42)).rejects.toMatchObject({
      name: 'GraphqlRequestError',
      code: 'UNAUTHENTICATED',
      status: 401,
    } satisfies Partial<GraphqlRequestError>);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(refreshAuthenticatedSession).toHaveBeenCalledTimes(1);
  });

  it('fetches and sends CSRF proof for mutations', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ data: { deleted: true } }));

    await expect(graphqlMutationRequest('mutation { deleted }', {}, 42))
      .resolves.toEqual({ deleted: true });

    expect(fetchCsrfToken).toHaveBeenCalledTimes(1);
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init?.headers).toMatchObject({
      'x-csrf-token': 'csrf-test-token',
      'x-organization-id': '42',
    });
  });
});
