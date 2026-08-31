import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GraphqlRequestError,
  graphqlMutationRequest,
  graphqlRequest,
} from './graphqlClient';
import {
  createWidgetViaGraphql,
  deletePlatformViaGraphql,
  deleteWidgetViaGraphql,
  getReputationConfigurationBootstrapViaGraphql,
  getPlatformsViaGraphql,
  getReputationSettingsViaGraphql,
  getWidgetViaGraphql,
  getWidgetEmbedCodeViaGraphql,
  getWidgetsViaGraphql,
  resetReputationConfigurationBootstrapCapability,
  resetReputationWidgetDetailCapability,
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
  beforeEach(() => {
    vi.clearAllMocks();
    resetReputationConfigurationBootstrapCapability();
    resetReputationWidgetDetailCapability();
  });

  it('loads the complete configuration route in one cancellable operation', async () => {
    const controller = new AbortController();
    vi.mocked(graphqlRequest).mockResolvedValueOnce({
      reputationConfigurationBootstrap: { platforms: [platform], settings },
    });

    await expect(getReputationConfigurationBootstrapViaGraphql(
      3,
      controller.signal,
    )).resolves.toMatchObject({
      platforms: [{ id: 4, platform_name: 'Google' }],
      settings: { organization_id: 3, auto_request_delay_days: 3 },
    });
    expect(graphqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('query ReputationConfigurationBootstrap'),
      {},
      3,
      controller.signal,
    );
  });

  it('negotiates separate platform and settings reads once', async () => {
    vi.mocked(graphqlRequest)
      .mockRejectedValueOnce(new GraphqlRequestError(
        'Cannot query field "reputationConfigurationBootstrap" on type "Query".',
        200,
      ))
      .mockResolvedValueOnce({ reputationPlatforms: [platform] })
      .mockResolvedValueOnce({ reputationSettings: settings })
      .mockResolvedValueOnce({ reputationPlatforms: [platform] })
      .mockResolvedValueOnce({ reputationSettings: settings });

    await getReputationConfigurationBootstrapViaGraphql(3);
    await getReputationConfigurationBootstrapViaGraphql(3);

    expect(graphqlRequest).toHaveBeenCalledTimes(5);
    expect(vi.mocked(graphqlRequest).mock.calls.filter(([query]) =>
      String(query).includes('ReputationConfigurationBootstrap'))).toHaveLength(1);
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

  it('loads only the selected widget and supports cancellation', async () => {
    const controller = new AbortController();
    vi.mocked(graphqlRequest).mockResolvedValueOnce({ reputationWidget: widget });

    await expect(getWidgetViaGraphql(8, 3, controller.signal)).resolves.toEqual(
      expect.objectContaining({ id: 8, name: 'Homepage', widget_type: 'grid' }),
    );
    expect(graphqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('query ReputationWidget($id:Int!)'),
      { id: 8 },
      3,
      controller.signal,
    );
  });

  it('negotiates the legacy widget-list fallback once', async () => {
    vi.mocked(graphqlRequest)
      .mockRejectedValueOnce(new GraphqlRequestError(
        'Cannot query field "reputationWidget" on type "Query".',
        200,
      ))
      .mockResolvedValueOnce({ reputationWidgets: [widget] })
      .mockResolvedValueOnce({ reputationWidgets: [widget] });

    await expect(getWidgetViaGraphql(8, 3)).resolves.toMatchObject({ id: 8 });
    await expect(getWidgetViaGraphql(8, 3)).resolves.toMatchObject({ id: 8 });

    expect(graphqlRequest).toHaveBeenCalledTimes(3);
    expect(vi.mocked(graphqlRequest).mock.calls.filter(([query]) =>
      String(query).includes('query ReputationWidget($id:Int!)'))).toHaveLength(1);
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
