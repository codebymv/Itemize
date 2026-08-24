import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { GraphQLError } from 'graphql';
import { itemizeGraphqlError } from '../common/graphql-error';
import {
  CreateReputationWidgetInput,
  UpdateReputationSettingsInput,
  UpdateReputationWidgetInput,
  UpsertReputationPlatformInput,
} from './reputation-configuration.inputs';
import {
  ReputationConfigurationReferenceError,
  ReputationConfigurationRepository,
  ReputationPlatformRow,
  ReputationSettingsRow,
  ReputationSettingsValues,
  ReputationWidgetRow,
  ReputationWidgetValues,
} from './reputation-configuration.repository';
import {
  ReputationPlatform,
  ReputationSettings,
  ReputationWidget,
  ReputationWidgetEmbedCode,
} from './reputation-configuration.types';

const PLATFORMS = new Set(['google', 'facebook', 'yelp', 'trustpilot', 'g2', 'capterra', 'custom']);
const WIDGET_TYPES = new Set(['carousel', 'grid', 'list', 'badge', 'floating']);
const THEMES = new Set(['light', 'dark', 'auto']);
const CHANNELS = new Set(['email', 'sms', 'both']);
const has = (value: object, field: string): boolean => Object.prototype.hasOwnProperty.call(value, field);

@Injectable()
export class ReputationConfigurationService {
  constructor(private readonly repository: ReputationConfigurationRepository) {}

  async platforms(organizationId: number): Promise<ReputationPlatform[]> {
    try { return (await this.repository.listPlatforms(organizationId)).map((row) => this.mapPlatform(row)); }
    catch (error) { this.rethrow(error); }
  }

  async upsertPlatform(
    organizationId: number, input: UpsertReputationPlatformInput,
  ): Promise<ReputationPlatform> {
    const platform = this.choice(input.platform, PLATFORMS, 'input.platform');
    const values = {
      platform,
      platformName: has(input, 'platformName')
        ? this.nullableText(input.platformName, 100, 'input.platformName')
        : platform,
      placeId: this.nullableText(input.placeId, 255, 'input.placeId'),
      pageId: this.nullableText(input.pageId, 255, 'input.pageId'),
      businessUrl: this.nullableUrl(input.businessUrl, 'input.businessUrl'),
      reviewUrl: this.nullableUrl(input.reviewUrl, 'input.reviewUrl'),
    };
    try { return this.mapPlatform(await this.repository.upsertPlatform(organizationId, values)); }
    catch (error) { this.rethrow(error); }
  }

  async deletePlatform(organizationId: number, id: number): Promise<number> {
    this.id(id, 'Platform');
    try {
      if (!(await this.repository.deletePlatform(organizationId, id))) {
        throw itemizeGraphqlError('Review platform not found', 'NOT_FOUND');
      }
      return id;
    } catch (error) { this.rethrow(error); }
  }

  async widgets(organizationId: number): Promise<ReputationWidget[]> {
    try { return (await this.repository.listWidgets(organizationId)).map((row) => this.mapWidget(row)); }
    catch (error) { this.rethrow(error); }
  }

  async createWidget(
    organizationId: number, input: CreateReputationWidgetInput,
  ): Promise<ReputationWidget> {
    const values = this.widgetValues(null, input);
    try {
      const row = await this.repository.createWidget(
        organizationId, randomBytes(16).toString('hex'), values,
      );
      return this.mapWidget(row);
    } catch (error) { this.rethrow(error); }
  }

  async updateWidget(
    organizationId: number, id: number, input: UpdateReputationWidgetInput,
  ): Promise<ReputationWidget> {
    this.id(id, 'Widget');
    if (Object.keys(input).length === 0) this.badInput('Widget update must include at least one field', 'input');
    try {
      const row = await this.repository.updateWidget(
        organizationId, id, (current) => this.widgetValues(current, input),
      );
      if (!row) throw itemizeGraphqlError('Review widget not found', 'NOT_FOUND');
      return this.mapWidget(row);
    } catch (error) { this.rethrow(error); }
  }

  async deleteWidget(organizationId: number, id: number): Promise<number> {
    this.id(id, 'Widget');
    try {
      if (!(await this.repository.deleteWidget(organizationId, id))) {
        throw itemizeGraphqlError('Review widget not found', 'NOT_FOUND');
      }
      return id;
    } catch (error) { this.rethrow(error); }
  }

  async widgetEmbedCode(organizationId: number, id: number): Promise<ReputationWidgetEmbedCode> {
    this.id(id, 'Widget');
    try {
      const widgetKey = await this.repository.getWidgetKey(organizationId, id);
      if (!widgetKey) throw itemizeGraphqlError('Review widget not found', 'NOT_FOUND');
      const appUrl = this.baseUrl(
        process.env.APP_URL || process.env.FRONTEND_URL, 'https://itemize.cloud',
      );
      const apiUrl = this.baseUrl(
        process.env.PUBLIC_API_URL || process.env.BACKEND_URL, appUrl,
      );
      return {
        widgetKey,
        embedCode: `<!-- Itemize Review Widget -->\n<div id="review-widget-${widgetKey}"></div>\n<script src="${appUrl}/widget/reviews.js" data-widget-key="${widgetKey}" data-api-base="${apiUrl}" async></script>`,
      };
    } catch (error) { this.rethrow(error); }
  }

  async settings(organizationId: number): Promise<ReputationSettings> {
    try { return this.mapSettings(organizationId, await this.repository.getSettings(organizationId)); }
    catch (error) { this.rethrow(error); }
  }

  async updateSettings(
    organizationId: number, input: UpdateReputationSettingsInput,
  ): Promise<ReputationSettings> {
    if (Object.keys(input).length === 0) this.badInput('Settings update must include at least one field', 'input');
    try {
      const row = await this.repository.upsertSettings(
        organizationId, (current) => this.settingsValues(input, current),
      );
      return this.mapSettings(organizationId, row);
    } catch (error) { this.rethrow(error); }
  }

  private widgetValues(
    current: ReputationWidgetRow | null,
    input: CreateReputationWidgetInput | UpdateReputationWidgetInput,
  ): ReputationWidgetValues {
    const value = <T>(field: keyof ReputationWidgetValues, fallback: T): T => {
      const inputField = ({
        widgetType: 'widgetType', primaryColor: 'primaryColor', backgroundColor: 'backgroundColor',
        textColor: 'textColor', borderRadius: 'borderRadius', showRatingStars: 'showRatingStars',
        showReviewerPhoto: 'showReviewerPhoto', showReviewDate: 'showReviewDate',
        showPlatformIcon: 'showPlatformIcon', minRating: 'minRating', maxReviews: 'maxReviews',
        hideNoTextReviews: 'hideNoTextReviews', autoRefresh: 'autoRefresh',
        refreshIntervalHours: 'refreshIntervalHours', isActive: 'isActive', name: 'name',
        theme: 'theme', platforms: 'platforms',
      } as const)[field];
      return has(input, inputField) ? (input as Record<string, T>)[inputField] : fallback;
    };
    const currentPlatforms = current?.platforms ?? [];
    return {
      name: this.requiredText(value('name', current?.name ?? ''), 255, 'input.name'),
      widgetType: this.choice(value('widgetType', current?.widget_type ?? 'carousel'), WIDGET_TYPES, 'input.widgetType'),
      theme: this.choice(value('theme', current?.theme ?? 'light'), THEMES, 'input.theme'),
      primaryColor: this.color(value('primaryColor', current?.primary_color ?? '#6366F1'), 'input.primaryColor'),
      backgroundColor: this.color(value('backgroundColor', current?.background_color ?? '#FFFFFF'), 'input.backgroundColor'),
      textColor: this.color(value('textColor', current?.text_color ?? '#1F2937'), 'input.textColor'),
      borderRadius: this.integer(value('borderRadius', Number(current?.border_radius ?? 8)), 0, 64, 'input.borderRadius'),
      showRatingStars: value('showRatingStars', current?.show_rating_stars ?? true),
      showReviewerPhoto: value('showReviewerPhoto', current?.show_reviewer_photo ?? true),
      showReviewDate: value('showReviewDate', current?.show_review_date ?? true),
      showPlatformIcon: value('showPlatformIcon', current?.show_platform_icon ?? true),
      minRating: this.integer(value('minRating', Number(current?.min_rating ?? 4)), 1, 5, 'input.minRating'),
      platforms: this.platformList(value('platforms', currentPlatforms)),
      maxReviews: this.integer(value('maxReviews', Number(current?.max_reviews ?? 10)), 1, 100, 'input.maxReviews'),
      hideNoTextReviews: value('hideNoTextReviews', current?.hide_no_text_reviews ?? false),
      autoRefresh: value('autoRefresh', current?.auto_refresh ?? true),
      refreshIntervalHours: this.integer(
        value('refreshIntervalHours', Number(current?.refresh_interval_hours ?? 24)), 1, 720,
        'input.refreshIntervalHours',
      ),
      isActive: value('isActive', current?.is_active ?? true),
    };
  }

  private settingsValues(
    input: UpdateReputationSettingsInput, current: ReputationSettingsRow | null,
  ): ReputationSettingsValues {
    const defaults = this.defaultSettings();
    const present = <T>(field: keyof UpdateReputationSettingsInput, fallback: T): T =>
      has(input, field) ? input[field] as T : fallback;
    return {
      autoRequestEnabled: present('autoRequestEnabled', current?.auto_request_enabled ?? defaults.autoRequestEnabled),
      autoRequestDelayDays: this.integer(
        present('autoRequestDelayDays', current?.auto_request_delay_days ?? defaults.autoRequestDelayDays),
        0, 365, 'input.autoRequestDelayDays',
      ),
      autoRequestChannel: this.choice(
        present('autoRequestChannel', current?.auto_request_channel ?? defaults.autoRequestChannel),
        CHANNELS, 'input.autoRequestChannel',
      ),
      autoRequestTrigger: this.requiredText(
        present('autoRequestTrigger', current?.auto_request_trigger ?? defaults.autoRequestTrigger),
        50, 'input.autoRequestTrigger',
      ),
      emailTemplateId: this.nullableId(
        present('emailTemplateId', current?.email_template_id ?? null), 'input.emailTemplateId',
      ),
      smsTemplateText: this.nullableText(
        present('smsTemplateText', current?.sms_template_text ?? null), 1600, 'input.smsTemplateText',
      ),
      negativeThreshold: this.integer(
        present('negativeThreshold', current?.negative_threshold ?? defaults.negativeThreshold),
        1, 5, 'input.negativeThreshold',
      ),
      negativeAlertEmail: this.nullableEmail(
        present('negativeAlertEmail', current?.negative_alert_email ?? null), 'input.negativeAlertEmail',
      ),
      negativeRouteInternal: present(
        'negativeRouteInternal', current?.negative_route_internal ?? defaults.negativeRouteInternal,
      ),
      positiveRouteUrl: this.nullableUrl(
        present('positiveRouteUrl', current?.positive_route_url ?? null), 'input.positiveRouteUrl',
      ),
      defaultReviewUrl: this.nullableUrl(
        present('defaultReviewUrl', current?.default_review_url ?? null), 'input.defaultReviewUrl',
      ),
      googlePlaceId: this.nullableText(
        present('googlePlaceId', current?.google_place_id ?? null), 255, 'input.googlePlaceId',
      ),
      newReviewNotifyEmail: present(
        'newReviewNotifyEmail', current?.new_review_notify_email ?? defaults.newReviewNotifyEmail,
      ),
      newReviewNotifySlack: present(
        'newReviewNotifySlack', current?.new_review_notify_slack ?? defaults.newReviewNotifySlack,
      ),
      slackWebhookUrl: this.nullableUrl(
        present('slackWebhookUrl', current?.slack_webhook_url ?? null), 'input.slackWebhookUrl',
      ),
    };
  }

  private defaultSettings(): ReputationSettingsValues {
    return {
      autoRequestEnabled: false, autoRequestDelayDays: 3, autoRequestChannel: 'email',
      autoRequestTrigger: 'deal_won', emailTemplateId: null, smsTemplateText: null,
      negativeThreshold: 3, negativeAlertEmail: null, negativeRouteInternal: true,
      positiveRouteUrl: null, defaultReviewUrl: null, googlePlaceId: null,
      newReviewNotifyEmail: true, newReviewNotifySlack: false, slackWebhookUrl: null,
    };
  }

  private mapPlatform(row: ReputationPlatformRow): ReputationPlatform {
    return {
      id: Number(row.id), organizationId: Number(row.organization_id), platform: row.platform,
      platformName: row.platform_name, placeId: row.place_id, pageId: row.page_id,
      businessUrl: row.business_url, reviewUrl: row.review_url,
      totalReviews: Number(row.total_reviews), averageRating: Number(row.average_rating),
      lastSyncedAt: row.last_synced_at, isActive: row.is_active, isConnected: row.is_connected,
      createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  private mapWidget(row: ReputationWidgetRow): ReputationWidget {
    return {
      id: Number(row.id), organizationId: Number(row.organization_id), widgetKey: row.widget_key,
      name: row.name, widgetType: row.widget_type, theme: row.theme,
      primaryColor: row.primary_color, backgroundColor: row.background_color,
      textColor: row.text_color, borderRadius: Number(row.border_radius),
      showRatingStars: row.show_rating_stars, showReviewerPhoto: row.show_reviewer_photo,
      showReviewDate: row.show_review_date, showPlatformIcon: row.show_platform_icon,
      minRating: Number(row.min_rating), platforms: row.platforms ?? [],
      maxReviews: Number(row.max_reviews), hideNoTextReviews: row.hide_no_text_reviews,
      autoRefresh: row.auto_refresh, refreshIntervalHours: Number(row.refresh_interval_hours),
      isActive: row.is_active, createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  private mapSettings(organizationId: number, row: ReputationSettingsRow | null): ReputationSettings {
    const value = row ? {
      autoRequestEnabled: row.auto_request_enabled ?? false,
      autoRequestDelayDays: Number(row.auto_request_delay_days ?? 3),
      autoRequestChannel: row.auto_request_channel ?? 'email',
      autoRequestTrigger: row.auto_request_trigger ?? 'deal_won', emailTemplateId: row.email_template_id,
      smsTemplateText: row.sms_template_text, negativeThreshold: Number(row.negative_threshold ?? 3),
      negativeAlertEmail: row.negative_alert_email,
      negativeRouteInternal: row.negative_route_internal ?? true, positiveRouteUrl: row.positive_route_url,
      defaultReviewUrl: row.default_review_url, googlePlaceId: row.google_place_id,
      newReviewNotifyEmail: row.new_review_notify_email ?? true,
      newReviewNotifySlack: row.new_review_notify_slack ?? false,
      slackWebhookUrl: row.slack_webhook_url,
    } : this.defaultSettings();
    return {
      id: row ? Number(row.id) : null, organizationId, ...value,
      createdAt: row?.created_at ?? null, updatedAt: row?.updated_at ?? null,
    };
  }

  private platformList(values: string[]): string[] {
    if (!Array.isArray(values) || values.length > PLATFORMS.size) {
      this.badInput('platforms contains too many values', 'input.platforms');
    }
    return [...new Set(values.map((value) => this.choice(value, PLATFORMS, 'input.platforms')))];
  }

  private choice(value: string, allowed: Set<string>, field: string): string {
    if (typeof value !== 'string') this.badInput(`${field.split('.').pop()} is invalid`, field);
    const normalized = value.trim().toLowerCase();
    if (!allowed.has(normalized)) this.badInput(`${field.split('.').pop()} is invalid`, field);
    return normalized;
  }

  private requiredText(value: string, maximum: number, field: string): string {
    if (typeof value !== 'string') this.badInput(`${field.split('.').pop()} is required`, field);
    const normalized = value.trim();
    if (!normalized || normalized.length > maximum) {
      this.badInput(`${field.split('.').pop()} must be between 1 and ${maximum} characters`, field);
    }
    return normalized;
  }

  private nullableText(
    value: string | null | undefined, maximum: number, field: string,
  ): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') this.badInput(`${field.split('.').pop()} is invalid`, field);
    const normalized = value.trim();
    if (normalized.length > maximum) this.badInput(`${field.split('.').pop()} is too long`, field);
    return normalized || null;
  }

  private nullableUrl(value: string | null | undefined, field: string): string | null {
    const normalized = this.nullableText(value, 500, field);
    if (!normalized) return null;
    try {
      const parsed = new URL(normalized);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
      return parsed.toString();
    } catch { this.badInput(`${field.split('.').pop()} must be an HTTP(S) URL`, field); }
  }

  private nullableEmail(value: string | null | undefined, field: string): string | null {
    const normalized = this.nullableText(value, 255, field);
    if (!normalized) return null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) this.badInput('Email is invalid', field);
    return normalized;
  }

  private color(value: string, field: string): string {
    if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) {
      this.badInput('Color must use #RRGGBB format', field);
    }
    return value.toUpperCase();
  }

  private integer(value: number, minimum: number, maximum: number, field: string): number {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      this.badInput(`${field.split('.').pop()} must be an integer from ${minimum} to ${maximum}`, field);
    }
    return value;
  }

  private nullableId(value: number | null | undefined, field: string): number | null {
    if (value === null || value === undefined) return null;
    return this.integer(value, 1, Number.MAX_SAFE_INTEGER, field);
  }

  private id(value: number, label: string): void {
    if (!Number.isSafeInteger(value) || value < 1) this.badInput(`${label} ID must be positive`, 'id');
  }

  private baseUrl(value: string | undefined, fallback: string): string {
    try {
      const parsed = new URL(value || fallback);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
      return parsed.toString().replace(/\/$/, '');
    } catch { return fallback.replace(/\/$/, ''); }
  }

  private badInput(message: string, field: string): never {
    throw itemizeGraphqlError(message, 'BAD_USER_INPUT', { field });
  }

  private rethrow(error: unknown): never {
    if (error instanceof GraphQLError) throw error;
    if (error instanceof ReputationConfigurationReferenceError) {
      throw itemizeGraphqlError(error.message, 'NOT_FOUND', {
        field: `input.${error.field}`, reason: 'REPUTATION_CONFIGURATION_REFERENCE_NOT_FOUND',
      });
    }
    throw itemizeGraphqlError('Reputation configuration operation failed', 'INTERNAL_SERVER_ERROR');
  }
}
