import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  graphqlMutationRequest,
  graphqlRequest,
  isReputationPlatformsGraphqlEnabled,
  isReputationSettingsGraphqlEnabled,
  isReputationWidgetsGraphqlEnabled,
} from './graphqlClient';
import {
  createWidgetViaGraphql,
  deletePlatformViaGraphql,
  deleteWidgetViaGraphql,
  getPlatformsViaGraphql,
  getReputationSettingsViaGraphql,
  getWidgetEmbedCodeViaGraphql,
  getWidgetsViaGraphql,
  updateReputationSettingsViaGraphql,
  updateWidgetViaGraphql,
  upsertPlatformViaGraphql,
} from './reputationConfigurationGraphql';

vi.mock('./graphqlClient', async (importOriginal) => ({
  ...await importOriginal<typeof import('./graphqlClient')>(),
  graphqlRequest: vi.fn(),
  graphqlMutationRequest: vi.fn(),
}));

const platform = {
  id: 4, organizationId: 3, platform: 'google' as const, platformName: 'Google',
  placeId: 'place-1', pageId: null, businessUrl: null,
  reviewUrl: 'https://google.example/review', totalReviews: 12, averageRating: 4.8,
  lastSyncedAt: null, isActive: true, isConnected: true,
  createdAt: '2026-07-22T00:00:00.000Z', updatedAt: '2026-07-22T00:00:00.000Z',
};
const widget = {
  id: 8, organizationId: 3, widgetKey: 'a'.repeat(32), name: 'Homepage',
  widgetType: 'grid' as const, theme: 'light' as const, primaryColor: '#6366F1',
  backgroundColor: '#FFFFFF', textColor: '#1F2937', borderRadius: 8,
  showRatingStars: true, showReviewerPhoto: true, showReviewDate: true,
  showPlatformIcon: true, minRating: 4, platforms: ['google'], maxReviews: 10,
  hideNoTextReviews: false, autoRefresh: true, refreshIntervalHours: 24,
  isActive: true, createdAt: '2026-07-22T00:00:00.000Z', updatedAt: '2026-07-22T00:00:00.000Z',
};
const settings = {
  id: null, organizationId: 3, autoRequestEnabled: false, autoRequestDelayDays: 3,
  autoRequestChannel: 'email', autoRequestTrigger: 'deal_won', emailTemplateId: null,
  smsTemplateText: null, negativeThreshold: 3, negativeAlertEmail: null,
  negativeRouteInternal: true, positiveRouteUrl: null, defaultReviewUrl: null,
  googlePlaceId: null, newReviewNotifyEmail: true, newReviewNotifySlack: false,
  slackWebhookUrl: null, createdAt: null, updatedAt: null,
};

describe('reputation configuration GraphQL adapters', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it('keeps platforms, settings, and widgets on independent default-off boundaries', () => {
    vi.stubEnv('VITE_REPUTATION_PLATFORMS_GRAPHQL', 'false');
    vi.stubEnv('VITE_REPUTATION_SETTINGS_GRAPHQL', 'false');
    vi.stubEnv('VITE_REPUTATION_WIDGETS_GRAPHQL', 'false');
    expect(isReputationPlatformsGraphqlEnabled()).toBe(false);
    expect(isReputationSettingsGraphqlEnabled()).toBe(false);
    expect(isReputationWidgetsGraphqlEnabled()).toBe(false);
    vi.stubEnv('VITE_REPUTATION_PLATFORMS_GRAPHQL', 'true');
    vi.stubEnv('VITE_REPUTATION_SETTINGS_GRAPHQL', 'true');
    vi.stubEnv('VITE_REPUTATION_WIDGETS_GRAPHQL', 'true');
    expect(isReputationPlatformsGraphqlEnabled()).toBe(true);
    expect(isReputationSettingsGraphqlEnabled()).toBe(true);
    expect(isReputationWidgetsGraphqlEnabled()).toBe(true);
  });

  it('maps platform reads, upserts, and exact deletes without credential fields', async () => {
    vi.mocked(graphqlRequest).mockResolvedValueOnce({ reputationPlatforms: [platform] });
    vi.mocked(graphqlMutationRequest)
      .mockResolvedValueOnce({ upsertReputationPlatform: platform })
      .mockResolvedValueOnce({ deleteReputationPlatform: { deletedId: 4 } });
    await expect(getPlatformsViaGraphql(3)).resolves.toEqual([expect.objectContaining({
      id: 4, organization_id: 3, platform_name: 'Google', average_rating: 4.8,
    })]);
    await upsertPlatformViaGraphql({
      platform: 'google', place_id: 'place-1', review_url: 'https://google.example/review',
    }, 3);
    expect(graphqlMutationRequest).toHaveBeenNthCalledWith(1, expect.stringContaining('UpsertReputationPlatform'), {
      input: { platform: 'google', placeId: 'place-1', reviewUrl: 'https://google.example/review' },
    }, 3);
    await expect(deletePlatformViaGraphql(4, 3)).resolves.toEqual({ success: true });
  });

  it('maps complete widgets, partial updates, embed code, and exact deletes', async () => {
    vi.mocked(graphqlRequest)
      .mockResolvedValueOnce({ reputationWidgets: [widget] })
      .mockResolvedValueOnce({ reputationWidgetEmbedCode: {
        embedCode: '<script data-widget-key="key"></script>', widgetKey: 'key',
      } });
    vi.mocked(graphqlMutationRequest)
      .mockResolvedValueOnce({ createReputationWidget: widget })
      .mockResolvedValueOnce({ updateReputationWidget: { ...widget, isActive: false } })
      .mockResolvedValueOnce({ deleteReputationWidget: { deletedId: 8 } });
    await expect(getWidgetsViaGraphql(3)).resolves.toEqual([expect.objectContaining({
      id: 8, organization_id: 3, widget_key: 'a'.repeat(32), widget_type: 'grid',
    })]);
    await createWidgetViaGraphql({ name: 'Homepage', widget_type: 'grid' }, 3);
    await updateWidgetViaGraphql(8, { is_active: false, max_reviews: 5 }, 3);
    expect(graphqlMutationRequest).toHaveBeenNthCalledWith(2, expect.stringContaining('UpdateReputationWidget'), {
      id: 8, input: { maxReviews: 5, isActive: false },
    }, 3);
    await expect(getWidgetEmbedCodeViaGraphql(8, 3)).resolves.toEqual({
      embed_code: '<script data-widget-key="key"></script>', widget_key: 'key',
    });
    await expect(deleteWidgetViaGraphql(8, 3)).resolves.toEqual({ success: true });
  });

  it('maps virtual defaults and partial settings mutations', async () => {
    vi.mocked(graphqlRequest).mockResolvedValueOnce({ reputationSettings: settings });
    vi.mocked(graphqlMutationRequest).mockResolvedValueOnce({ updateReputationSettings: {
      ...settings, id: 7, autoRequestEnabled: true, negativeThreshold: 2,
      createdAt: '2026-07-22T00:00:00.000Z', updatedAt: '2026-07-22T00:00:00.000Z',
    } });
    const defaults = await getReputationSettingsViaGraphql(3);
    expect(defaults).toMatchObject({ organization_id: 3, auto_request_delay_days: 3 });
    expect(defaults).not.toHaveProperty('id');
    await updateReputationSettingsViaGraphql({ auto_request_enabled: true, negative_threshold: 2 }, 3);
    expect(graphqlMutationRequest).toHaveBeenCalledWith(expect.stringContaining('UpdateReputationSettings'), {
      input: { autoRequestEnabled: true, negativeThreshold: 2 },
    }, 3);
  });
});
