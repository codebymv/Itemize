import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';
import type { ReputationSettings, ReviewPlatform, ReviewWidget } from './reputationApi';

type GraphqlPlatform = {
  id: number; organizationId: number; platform: ReviewPlatform['platform'];
  platformName: string | null; placeId: string | null; pageId: string | null;
  businessUrl: string | null; reviewUrl: string | null; totalReviews: number;
  averageRating: number; lastSyncedAt: string | null; isActive: boolean;
  isConnected: boolean; createdAt: string; updatedAt: string;
};

type GraphqlWidget = {
  id: number; organizationId: number; widgetKey: string; name: string;
  widgetType: ReviewWidget['widget_type']; theme: ReviewWidget['theme'];
  primaryColor: string; backgroundColor: string; textColor: string; borderRadius: number;
  showRatingStars: boolean; showReviewerPhoto: boolean; showReviewDate: boolean;
  showPlatformIcon: boolean; minRating: number; platforms: string[]; maxReviews: number;
  hideNoTextReviews: boolean; autoRefresh: boolean; refreshIntervalHours: number;
  isActive: boolean; createdAt: string; updatedAt: string;
};

type GraphqlSettings = {
  id: number | null; organizationId: number; autoRequestEnabled: boolean;
  autoRequestDelayDays: number; autoRequestChannel: string; autoRequestTrigger: string;
  emailTemplateId: number | null; smsTemplateText: string | null; negativeThreshold: number;
  negativeAlertEmail: string | null; negativeRouteInternal: boolean;
  positiveRouteUrl: string | null; defaultReviewUrl: string | null; googlePlaceId: string | null;
  newReviewNotifyEmail: boolean; newReviewNotifySlack: boolean; slackWebhookUrl: string | null;
  createdAt: string | null; updatedAt: string | null;
};

const platformFields = `id organizationId platform platformName placeId pageId businessUrl reviewUrl
  totalReviews averageRating lastSyncedAt isActive isConnected createdAt updatedAt`;
const widgetFields = `id organizationId widgetKey name widgetType theme primaryColor backgroundColor
  textColor borderRadius showRatingStars showReviewerPhoto showReviewDate showPlatformIcon minRating
  platforms maxReviews hideNoTextReviews autoRefresh refreshIntervalHours isActive createdAt updatedAt`;
const settingsFields = `id organizationId autoRequestEnabled autoRequestDelayDays autoRequestChannel
  autoRequestTrigger emailTemplateId smsTemplateText negativeThreshold negativeAlertEmail
  negativeRouteInternal positiveRouteUrl defaultReviewUrl googlePlaceId newReviewNotifyEmail
  newReviewNotifySlack slackWebhookUrl createdAt updatedAt`;

const mapPlatform = (row: GraphqlPlatform): ReviewPlatform => ({
  id: row.id, organization_id: row.organizationId, platform: row.platform,
  ...(row.platformName === null ? {} : { platform_name: row.platformName }),
  ...(row.placeId === null ? {} : { place_id: row.placeId }),
  ...(row.pageId === null ? {} : { page_id: row.pageId }),
  ...(row.businessUrl === null ? {} : { business_url: row.businessUrl }),
  ...(row.reviewUrl === null ? {} : { review_url: row.reviewUrl }),
  total_reviews: row.totalReviews, average_rating: row.averageRating,
  ...(row.lastSyncedAt === null ? {} : { last_synced_at: row.lastSyncedAt }),
  is_active: row.isActive, is_connected: row.isConnected,
  created_at: row.createdAt, updated_at: row.updatedAt,
});

const mapWidget = (row: GraphqlWidget): ReviewWidget => ({
  id: row.id, organization_id: row.organizationId, widget_key: row.widgetKey, name: row.name,
  widget_type: row.widgetType, theme: row.theme, primary_color: row.primaryColor,
  background_color: row.backgroundColor, text_color: row.textColor,
  border_radius: row.borderRadius, show_rating_stars: row.showRatingStars,
  show_reviewer_photo: row.showReviewerPhoto, show_review_date: row.showReviewDate,
  show_platform_icon: row.showPlatformIcon, min_rating: row.minRating,
  platforms: row.platforms, max_reviews: row.maxReviews,
  hide_no_text_reviews: row.hideNoTextReviews, auto_refresh: row.autoRefresh,
  refresh_interval_hours: row.refreshIntervalHours, is_active: row.isActive,
  created_at: row.createdAt, updated_at: row.updatedAt,
});

const mapSettings = (row: GraphqlSettings): ReputationSettings => ({
  ...(row.id === null ? {} : { id: row.id }), organization_id: row.organizationId,
  auto_request_enabled: row.autoRequestEnabled, auto_request_delay_days: row.autoRequestDelayDays,
  auto_request_channel: row.autoRequestChannel, auto_request_trigger: row.autoRequestTrigger,
  ...(row.emailTemplateId === null ? {} : { email_template_id: row.emailTemplateId }),
  ...(row.smsTemplateText === null ? {} : { sms_template_text: row.smsTemplateText }),
  negative_threshold: row.negativeThreshold,
  ...(row.negativeAlertEmail === null ? {} : { negative_alert_email: row.negativeAlertEmail }),
  negative_route_internal: row.negativeRouteInternal,
  ...(row.positiveRouteUrl === null ? {} : { positive_route_url: row.positiveRouteUrl }),
  ...(row.defaultReviewUrl === null ? {} : { default_review_url: row.defaultReviewUrl }),
  ...(row.googlePlaceId === null ? {} : { google_place_id: row.googlePlaceId }),
  new_review_notify_email: row.newReviewNotifyEmail,
  new_review_notify_slack: row.newReviewNotifySlack,
  ...(row.slackWebhookUrl === null ? {} : { slack_webhook_url: row.slackWebhookUrl }),
  ...(row.createdAt === null ? {} : { created_at: row.createdAt }),
  ...(row.updatedAt === null ? {} : { updated_at: row.updatedAt }),
});

export const getPlatformsViaGraphql = async (organizationId?: number): Promise<ReviewPlatform[]> => {
  const data = await graphqlRequest<{ reputationPlatforms: GraphqlPlatform[] }, Record<string, never>>(
    `query ReputationPlatforms { reputationPlatforms { ${platformFields} } }`, {}, organizationId,
  );
  return data.reputationPlatforms.map(mapPlatform);
};

export const upsertPlatformViaGraphql = async (
  platform: Partial<ReviewPlatform>, organizationId?: number,
): Promise<ReviewPlatform> => {
  const input = {
    platform: platform.platform,
    ...(platform.platform_name === undefined ? {} : { platformName: platform.platform_name }),
    ...(platform.place_id === undefined ? {} : { placeId: platform.place_id }),
    ...(platform.page_id === undefined ? {} : { pageId: platform.page_id }),
    ...(platform.business_url === undefined ? {} : { businessUrl: platform.business_url }),
    ...(platform.review_url === undefined ? {} : { reviewUrl: platform.review_url }),
  };
  const data = await graphqlMutationRequest<
    { upsertReputationPlatform: GraphqlPlatform }, { input: typeof input }
  >(`mutation UpsertReputationPlatform($input: UpsertReputationPlatformInput!) {
    upsertReputationPlatform(input: $input) { ${platformFields} }
  }`, { input }, organizationId);
  return mapPlatform(data.upsertReputationPlatform);
};

export const deletePlatformViaGraphql = async (
  id: number, organizationId?: number,
): Promise<{ success: boolean }> => {
  const data = await graphqlMutationRequest<
    { deleteReputationPlatform: { deletedId: number } }, { id: number }
  >('mutation DeleteReputationPlatform($id:Int!){ deleteReputationPlatform(id:$id){ deletedId } }',
    { id }, organizationId);
  if (data.deleteReputationPlatform.deletedId !== id) throw new Error('GraphQL deleted a different platform');
  return { success: true };
};

export const getWidgetsViaGraphql = async (organizationId?: number): Promise<ReviewWidget[]> => {
  const data = await graphqlRequest<{ reputationWidgets: GraphqlWidget[] }, Record<string, never>>(
    `query ReputationWidgets { reputationWidgets { ${widgetFields} } }`, {}, organizationId,
  );
  return data.reputationWidgets.map(mapWidget);
};

const widgetInput = (widget: Partial<ReviewWidget>) => ({
  ...(widget.name === undefined ? {} : { name: widget.name }),
  ...(widget.widget_type === undefined ? {} : { widgetType: widget.widget_type }),
  ...(widget.theme === undefined ? {} : { theme: widget.theme }),
  ...(widget.primary_color === undefined ? {} : { primaryColor: widget.primary_color }),
  ...(widget.background_color === undefined ? {} : { backgroundColor: widget.background_color }),
  ...(widget.text_color === undefined ? {} : { textColor: widget.text_color }),
  ...(widget.border_radius === undefined ? {} : { borderRadius: widget.border_radius }),
  ...(widget.show_rating_stars === undefined ? {} : { showRatingStars: widget.show_rating_stars }),
  ...(widget.show_reviewer_photo === undefined ? {} : { showReviewerPhoto: widget.show_reviewer_photo }),
  ...(widget.show_review_date === undefined ? {} : { showReviewDate: widget.show_review_date }),
  ...(widget.show_platform_icon === undefined ? {} : { showPlatformIcon: widget.show_platform_icon }),
  ...(widget.min_rating === undefined ? {} : { minRating: widget.min_rating }),
  ...(widget.platforms === undefined ? {} : { platforms: widget.platforms }),
  ...(widget.max_reviews === undefined ? {} : { maxReviews: widget.max_reviews }),
  ...(widget.hide_no_text_reviews === undefined ? {} : { hideNoTextReviews: widget.hide_no_text_reviews }),
  ...(widget.auto_refresh === undefined ? {} : { autoRefresh: widget.auto_refresh }),
  ...(widget.refresh_interval_hours === undefined ? {} : { refreshIntervalHours: widget.refresh_interval_hours }),
  ...(widget.is_active === undefined ? {} : { isActive: widget.is_active }),
});

export const createWidgetViaGraphql = async (
  widget: Partial<ReviewWidget>, organizationId?: number,
): Promise<ReviewWidget> => {
  const input = widgetInput(widget);
  const data = await graphqlMutationRequest<
    { createReputationWidget: GraphqlWidget }, { input: typeof input }
  >(`mutation CreateReputationWidget($input: CreateReputationWidgetInput!) {
    createReputationWidget(input: $input) { ${widgetFields} }
  }`, { input }, organizationId);
  return mapWidget(data.createReputationWidget);
};

export const updateWidgetViaGraphql = async (
  id: number, widget: Partial<ReviewWidget>, organizationId?: number,
): Promise<ReviewWidget> => {
  const variables = { id, input: widgetInput(widget) };
  const data = await graphqlMutationRequest<
    { updateReputationWidget: GraphqlWidget }, typeof variables
  >(`mutation UpdateReputationWidget($id:Int!,$input:UpdateReputationWidgetInput!) {
    updateReputationWidget(id:$id,input:$input) { ${widgetFields} }
  }`, variables, organizationId);
  return mapWidget(data.updateReputationWidget);
};

export const deleteWidgetViaGraphql = async (
  id: number, organizationId?: number,
): Promise<{ success: boolean }> => {
  const data = await graphqlMutationRequest<
    { deleteReputationWidget: { deletedId: number } }, { id: number }
  >('mutation DeleteReputationWidget($id:Int!){ deleteReputationWidget(id:$id){ deletedId } }',
    { id }, organizationId);
  if (data.deleteReputationWidget.deletedId !== id) throw new Error('GraphQL deleted a different widget');
  return { success: true };
};

export const getWidgetEmbedCodeViaGraphql = async (
  id: number, organizationId?: number,
): Promise<{ embed_code: string; widget_key: string }> => {
  const data = await graphqlRequest<
    { reputationWidgetEmbedCode: { embedCode: string; widgetKey: string } }, { id: number }
  >('query ReputationWidgetEmbedCode($id:Int!){ reputationWidgetEmbedCode(id:$id){ embedCode widgetKey } }',
    { id }, organizationId);
  return {
    embed_code: data.reputationWidgetEmbedCode.embedCode,
    widget_key: data.reputationWidgetEmbedCode.widgetKey,
  };
};

export const getReputationSettingsViaGraphql = async (
  organizationId?: number,
): Promise<ReputationSettings> => {
  const data = await graphqlRequest<{ reputationSettings: GraphqlSettings }, Record<string, never>>(
    `query ReputationSettings { reputationSettings { ${settingsFields} } }`, {}, organizationId,
  );
  return mapSettings(data.reputationSettings);
};

const settingsInput = (settings: Partial<ReputationSettings>) => ({
  ...(settings.auto_request_enabled === undefined ? {} : { autoRequestEnabled: settings.auto_request_enabled }),
  ...(settings.auto_request_delay_days === undefined ? {} : { autoRequestDelayDays: settings.auto_request_delay_days }),
  ...(settings.auto_request_channel === undefined ? {} : { autoRequestChannel: settings.auto_request_channel }),
  ...(settings.auto_request_trigger === undefined ? {} : { autoRequestTrigger: settings.auto_request_trigger }),
  ...(settings.email_template_id === undefined ? {} : { emailTemplateId: settings.email_template_id }),
  ...(settings.sms_template_text === undefined ? {} : { smsTemplateText: settings.sms_template_text }),
  ...(settings.negative_threshold === undefined ? {} : { negativeThreshold: settings.negative_threshold }),
  ...(settings.negative_alert_email === undefined ? {} : { negativeAlertEmail: settings.negative_alert_email }),
  ...(settings.negative_route_internal === undefined ? {} : { negativeRouteInternal: settings.negative_route_internal }),
  ...(settings.positive_route_url === undefined ? {} : { positiveRouteUrl: settings.positive_route_url }),
  ...(settings.default_review_url === undefined ? {} : { defaultReviewUrl: settings.default_review_url }),
  ...(settings.google_place_id === undefined ? {} : { googlePlaceId: settings.google_place_id }),
  ...(settings.new_review_notify_email === undefined ? {} : { newReviewNotifyEmail: settings.new_review_notify_email }),
  ...(settings.new_review_notify_slack === undefined ? {} : { newReviewNotifySlack: settings.new_review_notify_slack }),
  ...(settings.slack_webhook_url === undefined ? {} : { slackWebhookUrl: settings.slack_webhook_url }),
});

export const updateReputationSettingsViaGraphql = async (
  settings: Partial<ReputationSettings>, organizationId?: number,
): Promise<ReputationSettings> => {
  const input = settingsInput(settings);
  const data = await graphqlMutationRequest<
    { updateReputationSettings: GraphqlSettings }, { input: typeof input }
  >(`mutation UpdateReputationSettings($input:UpdateReputationSettingsInput!) {
    updateReputationSettings(input:$input) { ${settingsFields} }
  }`, { input }, organizationId);
  return mapSettings(data.updateReputationSettings);
};
