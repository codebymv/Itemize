import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken } from '@/lib/api';
import {
  completeOnboardingStepViaGraphql,
  getOnboardingFeatureProgressViaGraphql,
  getOnboardingProgressViaGraphql,
  markOnboardingSeenViaGraphql,
  resetOnboardingViaGraphql,
} from './onboardingGraphql';

vi.mock('@/lib/api', () => ({
  fetchCsrfToken: vi.fn(),
  getApiUrl: vi.fn(() => 'https://api.test.itemize'),
  refreshAuthenticatedSession: vi.fn(),
}));

const entry = {
  featureKey: 'dashboard',
  seen: true,
  timestamp: '2026-07-17T12:00:00.000Z',
  version: '2.0',
  dismissed: false,
  stepCompleted: 3,
};

const response = (payload: unknown): Response =>
  ({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(payload),
  }) as unknown as Response;

describe('onboarding GraphQL consumer', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(fetchCsrfToken).mockResolvedValue('onboarding-csrf');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('maps typed progress entries into the existing keyed consumer contract', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        response({ data: { onboardingProgress: [entry] } }),
      )
      .mockResolvedValueOnce(
        response({
          data: {
            onboardingFeatureProgress: {
              ...entry,
              timestamp: null,
              version: null,
              stepCompleted: null,
            },
          },
        }),
      );

    await expect(getOnboardingProgressViaGraphql()).resolves.toEqual({
      dashboard: {
        seen: true,
        timestamp: entry.timestamp,
        version: '2.0',
        dismissed: false,
        step_completed: 3,
      },
    });
    await expect(
      getOnboardingFeatureProgressViaGraphql('dashboard'),
    ).resolves.toEqual({ seen: true, dismissed: false });
  });

  it('sends protected mutations with CSRF and preserves variables', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        response({ data: { markOnboardingSeen: [entry] } }),
      )
      .mockResolvedValueOnce(
        response({ data: { completeOnboardingStep: [entry] } }),
      )
      .mockResolvedValueOnce(response({ data: { resetOnboarding: [] } }));

    await markOnboardingSeenViaGraphql('dashboard', '2.0');
    await completeOnboardingStepViaGraphql('dashboard', 3);
    await resetOnboardingViaGraphql();

    const bodies = vi.mocked(fetch).mock.calls.map((call) =>
      JSON.parse(String((call[1] as RequestInit).body)),
    );
    expect(bodies[0].variables).toEqual({
      input: { featureKey: 'dashboard', version: '2.0' },
    });
    expect(bodies[1].variables).toEqual({ featureKey: 'dashboard', step: 3 });
    expect(bodies[2].variables).toEqual({ featureKey: null });
    expect(fetchCsrfToken).toHaveBeenCalledTimes(3);
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({
      credentials: 'include',
      headers: expect.objectContaining({
        'x-csrf-token': 'onboarding-csrf',
      }),
    });
  });
});
