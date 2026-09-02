import api from '@/lib/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
import { getReputationAnalyticsViaGraphql } from './reputationAnalyticsGraphql';
import {
  deleteReviewRequestViaGraphql,
  getReviewRequestsViaGraphql,
  resendReviewRequestViaGraphql,
  sendBulkReviewRequestsViaGraphql,
  sendReviewRequestViaGraphql,
} from './reputationRequestsGraphql';
import {
  createReviewViaGraphql,
  deleteReviewViaGraphql,
  getReviewViaGraphql,
  getReviewsViaGraphql,
  updateReviewViaGraphql,
} from './reputationReviewsGraphql';
import {
  addPlatform,
  createReview,
  createWidget,
  deleteReview,
  deleteReviewRequest,
  deleteWidget,
  getPlatforms,
  getPublicReviewRequest,
  getReputationAnalytics,
  getReputationSettings,
  getReview,
  getReviewRequests,
  getReviews,
  getWidgetEmbedCode,
  getWidgets,
  removePlatform,
  resendReviewRequest,
  sendBulkReviewRequests,
  sendReviewRequest,
  submitPublicReview,
  updateReputationSettings,
  updateReview,
  updateWidget,
} from './reputationApi';

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('./reputationConfigurationGraphql', () => ({
  createWidgetViaGraphql: vi.fn(),
  deletePlatformViaGraphql: vi.fn(),
  deleteWidgetViaGraphql: vi.fn(),
  getPlatformsViaGraphql: vi.fn(),
  getReputationSettingsViaGraphql: vi.fn(),
  getWidgetEmbedCodeViaGraphql: vi.fn(),
  getWidgetsViaGraphql: vi.fn(),
  updateReputationSettingsViaGraphql: vi.fn(),
  updateWidgetViaGraphql: vi.fn(),
  upsertPlatformViaGraphql: vi.fn(),
}));

vi.mock('./reputationAnalyticsGraphql', () => ({
  getReputationAnalyticsViaGraphql: vi.fn(),
}));

vi.mock('./reputationRequestsGraphql', () => ({
  deleteReviewRequestViaGraphql: vi.fn(),
  getReviewRequestsViaGraphql: vi.fn(),
  resendReviewRequestViaGraphql: vi.fn(),
  sendBulkReviewRequestsViaGraphql: vi.fn(),
  sendReviewRequestViaGraphql: vi.fn(),
}));

vi.mock('./reputationReviewsGraphql', () => ({
  createReviewViaGraphql: vi.fn(),
  deleteReviewViaGraphql: vi.fn(),
  getReviewViaGraphql: vi.fn(),
  getReviewsViaGraphql: vi.fn(),
  updateReviewViaGraphql: vi.fn(),
}));

describe('reputation API permanent transport selection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('routes all platform, widget, and settings operations directly through GraphQL', async () => {
    const platformInput = { platform: 'google' as const };
    const widgetInput = { name: 'Homepage' };
    const settingsInput = { auto_request_enabled: true };

    await Promise.all([
      getPlatforms(3),
      addPlatform(platformInput, 3),
      removePlatform(17, 3),
      getWidgets(3),
      createWidget(widgetInput, 3, 'create-widget-key'),
      updateWidget(19, widgetInput, 3),
      deleteWidget(19, 3),
      getWidgetEmbedCode(19, 3),
      getReputationSettings(3),
      updateReputationSettings(settingsInput, 3),
    ]);

    expect(getPlatformsViaGraphql).toHaveBeenCalledWith(3);
    expect(upsertPlatformViaGraphql).toHaveBeenCalledWith(platformInput, 3);
    expect(deletePlatformViaGraphql).toHaveBeenCalledWith(17, 3);
    expect(getWidgetsViaGraphql).toHaveBeenCalledWith(3);
    expect(createWidgetViaGraphql).toHaveBeenCalledWith(widgetInput, 3, 'create-widget-key');
    expect(updateWidgetViaGraphql).toHaveBeenCalledWith(19, widgetInput, 3);
    expect(deleteWidgetViaGraphql).toHaveBeenCalledWith(19, 3);
    expect(getWidgetEmbedCodeViaGraphql).toHaveBeenCalledWith(19, 3);
    expect(getReputationSettingsViaGraphql).toHaveBeenCalledWith(3);
    expect(updateReputationSettingsViaGraphql).toHaveBeenCalledWith(settingsInput, 3);
    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('routes all authenticated review operations directly through GraphQL', async () => {
    const createInput = { rating: 5 };
    const updateInput = { status: 'read' as const };

    await Promise.all([
      getReviews({ rating: 5 }, 3),
      getReview(29, 3),
      createReview(createInput, 3),
      updateReview(29, updateInput, 3),
      deleteReview(29, 3),
    ]);

    expect(getReviewsViaGraphql).toHaveBeenCalledWith({ rating: 5 }, 3);
    expect(getReviewViaGraphql).toHaveBeenCalledWith(29, 3);
    expect(createReviewViaGraphql).toHaveBeenCalledWith(createInput, 3);
    expect(updateReviewViaGraphql).toHaveBeenCalledWith(29, updateInput, 3);
    expect(deleteReviewViaGraphql).toHaveBeenCalledWith(29, 3);
    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('routes all authenticated request operations directly through GraphQL', async () => {
    const sendInput = { contact_email: 'ada@example.test', channel: 'email' as const };
    const bulkInput = { contact_ids: [7], channel: 'sms' as const };

    await Promise.all([
      getReviewRequests({ status: 'pending' }, 3),
      sendReviewRequest(sendInput, 3, 'send-key'),
      sendBulkReviewRequests(bulkInput, 3, 'bulk-key'),
      resendReviewRequest(31, 3, 'resend-key'),
      deleteReviewRequest(31, 3),
    ]);

    expect(getReviewRequestsViaGraphql).toHaveBeenCalledWith({ status: 'pending' }, 3);
    expect(sendReviewRequestViaGraphql).toHaveBeenCalledWith(sendInput, 3, 'send-key');
    expect(sendBulkReviewRequestsViaGraphql).toHaveBeenCalledWith(bulkInput, 3, 'bulk-key');
    expect(resendReviewRequestViaGraphql).toHaveBeenCalledWith(31, 3, 'resend-key');
    expect(deleteReviewRequestViaGraphql).toHaveBeenCalledWith(31, 3);
    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('routes authenticated analytics directly through GraphQL', async () => {
    await getReputationAnalytics(90, 3);

    expect(getReputationAnalyticsViaGraphql).toHaveBeenCalledWith(90, 3);
    expect(api.get).not.toHaveBeenCalled();
  });

  it('keeps anonymous review capabilities on their public HTTP boundary', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { data: { organization_name: 'Example' } },
    });
    vi.mocked(api.post).mockResolvedValue({
      data: { data: { success: true, redirect_url: 'https://example.test/review' } },
    });

    await expect(getPublicReviewRequest('token/value')).resolves.toEqual({
      organization_name: 'Example',
    });
    await expect(submitPublicReview('token/value', { rating: 5 })).resolves.toEqual({
      success: true,
      redirect_url: 'https://example.test/review',
    });

    expect(api.get).toHaveBeenCalledWith(
      '/api/reputation/public/review/token%2Fvalue',
      { publicRequest: true, withCredentials: false },
    );
    expect(api.post).toHaveBeenCalledWith(
      '/api/reputation/public/review/token%2Fvalue',
      { rating: 5 },
      {
        publicRequest: true,
        retryOnNetworkError: true,
        withCredentials: false,
      },
    );
  });
});
