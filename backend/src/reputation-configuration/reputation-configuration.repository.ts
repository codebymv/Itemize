import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type ReputationPlatformRow = {
  id: number; organization_id: number; platform: string; platform_name: string | null;
  place_id: string | null; page_id: string | null; business_url: string | null;
  review_url: string | null; total_reviews: number; average_rating: string | number;
  last_synced_at: Date | null; is_active: boolean; is_connected: boolean;
  created_at: Date; updated_at: Date;
};

export type ReputationPlatformValues = {
  platform: string; platformName: string | null; placeId: string | null;
  pageId: string | null; businessUrl: string | null; reviewUrl: string | null;
};

export type ReputationWidgetRow = {
  id: number; organization_id: number; widget_key: string; name: string;
  widget_type: string; theme: string; primary_color: string; background_color: string;
  text_color: string; border_radius: number; show_rating_stars: boolean;
  show_reviewer_photo: boolean; show_review_date: boolean; show_platform_icon: boolean;
  min_rating: number; platforms: string[]; max_reviews: number;
  hide_no_text_reviews: boolean; auto_refresh: boolean; refresh_interval_hours: number;
  is_active: boolean; created_at: Date; updated_at: Date;
};

export type ReputationWidgetValues = {
  name: string; widgetType: string; theme: string; primaryColor: string;
  backgroundColor: string; textColor: string; borderRadius: number;
  showRatingStars: boolean; showReviewerPhoto: boolean; showReviewDate: boolean;
  showPlatformIcon: boolean; minRating: number; platforms: string[]; maxReviews: number;
  hideNoTextReviews: boolean; autoRefresh: boolean; refreshIntervalHours: number;
  isActive: boolean;
};

export type ReputationSettingsRow = {
  id: number; organization_id: number; auto_request_enabled: boolean | null;
  auto_request_delay_days: number | null; auto_request_channel: string | null;
  auto_request_trigger: string | null; email_template_id: number | null;
  sms_template_text: string | null; negative_threshold: number | null;
  negative_alert_email: string | null; negative_route_internal: boolean | null;
  positive_route_url: string | null; default_review_url: string | null;
  google_place_id: string | null; new_review_notify_email: boolean | null;
  new_review_notify_slack: boolean | null; slack_webhook_url: string | null;
  created_at: Date; updated_at: Date;
};

export type ReputationSettingsValues = {
  autoRequestEnabled: boolean; autoRequestDelayDays: number; autoRequestChannel: string;
  autoRequestTrigger: string; emailTemplateId: number | null; smsTemplateText: string | null;
  negativeThreshold: number; negativeAlertEmail: string | null; negativeRouteInternal: boolean;
  positiveRouteUrl: string | null; defaultReviewUrl: string | null; googlePlaceId: string | null;
  newReviewNotifyEmail: boolean; newReviewNotifySlack: boolean; slackWebhookUrl: string | null;
};

export class ReputationConfigurationReferenceError extends Error {
  constructor(readonly field: 'emailTemplateId', message: string) { super(message); }
}

const platformSelection = `id,organization_id,platform,platform_name,place_id,page_id,
  business_url,review_url,total_reviews,average_rating,last_synced_at,is_active,is_connected,
  created_at,updated_at`;
const widgetSelection = `id,organization_id,widget_key,name,widget_type,theme,primary_color,
  background_color,text_color,border_radius,show_rating_stars,show_reviewer_photo,
  show_review_date,show_platform_icon,min_rating,platforms,max_reviews,hide_no_text_reviews,
  auto_refresh,refresh_interval_hours,is_active,created_at,updated_at`;
const settingsSelection = `id,organization_id,auto_request_enabled,auto_request_delay_days,
  auto_request_channel,auto_request_trigger,email_template_id,sms_template_text,
  negative_threshold,negative_alert_email,negative_route_internal,positive_route_url,
  default_review_url,google_place_id,new_review_notify_email,new_review_notify_slack,
  slack_webhook_url,created_at,updated_at`;

@Injectable()
export class ReputationConfigurationRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async listPlatforms(organizationId: number): Promise<ReputationPlatformRow[]> {
    const result = await this.pool.query<ReputationPlatformRow>(
      `SELECT ${platformSelection} FROM review_platforms
       WHERE organization_id=$1 ORDER BY platform ASC,id ASC`, [organizationId],
    );
    return result.rows;
  }

  async upsertPlatform(
    organizationId: number, values: ReputationPlatformValues,
  ): Promise<ReputationPlatformRow> {
    return this.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1::int,hashtext($2))', [
        organizationId, `${values.platform}:${values.placeId ?? ''}`,
      ]);
      const existing = await client.query<{ id: number }>(
        `SELECT id FROM review_platforms WHERE organization_id=$1 AND platform=$2
         AND place_id IS NOT DISTINCT FROM $3 FOR UPDATE`,
        [organizationId, values.platform, values.placeId],
      );
      let id: number;
      if (existing.rows[0]) {
        id = Number(existing.rows[0].id);
        await client.query(
          `UPDATE review_platforms SET platform_name=$1,page_id=$2,business_url=$3,
             review_url=$4,is_connected=TRUE,updated_at=CURRENT_TIMESTAMP
           WHERE id=$5 AND organization_id=$6`,
          [values.platformName, values.pageId, values.businessUrl, values.reviewUrl, id, organizationId],
        );
      } else {
        const inserted = await client.query<{ id: number }>(
          `INSERT INTO review_platforms
             (organization_id,platform,platform_name,place_id,page_id,business_url,review_url,is_connected)
           VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE) RETURNING id`,
          [organizationId, values.platform, values.platformName, values.placeId, values.pageId,
            values.businessUrl, values.reviewUrl],
        );
        id = Number(inserted.rows[0].id);
      }
      return this.platformById(client, organizationId, id);
    });
  }

  async deletePlatform(organizationId: number, id: number): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM review_platforms WHERE id=$1 AND organization_id=$2 RETURNING id',
      [id, organizationId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listWidgets(organizationId: number): Promise<ReputationWidgetRow[]> {
    const result = await this.pool.query<ReputationWidgetRow>(
      `SELECT ${widgetSelection} FROM review_widgets
       WHERE organization_id=$1 ORDER BY name ASC,id ASC`, [organizationId],
    );
    return result.rows;
  }

  async createWidget(
    organizationId: number, widgetKey: string, values: ReputationWidgetValues,
  ): Promise<ReputationWidgetRow> {
    const result = await this.pool.query<ReputationWidgetRow>(
      `INSERT INTO review_widgets (
         organization_id,widget_key,name,widget_type,theme,primary_color,background_color,
         text_color,border_radius,show_rating_stars,show_reviewer_photo,show_review_date,
         show_platform_icon,min_rating,platforms,max_reviews,hide_no_text_reviews,
         auto_refresh,refresh_interval_hours,is_active
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::text[],$16,$17,$18,$19,$20)
       RETURNING ${widgetSelection}`,
      [organizationId, widgetKey, ...this.widgetParams(values)],
    );
    return result.rows[0];
  }

  async updateWidget(
    organizationId: number,
    id: number,
    prepare: (current: ReputationWidgetRow) => ReputationWidgetValues,
  ): Promise<ReputationWidgetRow | null> {
    return this.transaction(async (client) => {
      const current = await client.query<ReputationWidgetRow>(
        `SELECT ${widgetSelection} FROM review_widgets
         WHERE id=$1 AND organization_id=$2 FOR UPDATE`, [id, organizationId],
      );
      if (!current.rows[0]) return null;
      const values = prepare(current.rows[0]);
      const result = await client.query<ReputationWidgetRow>(
        `UPDATE review_widgets SET name=$1,widget_type=$2,theme=$3,primary_color=$4,
           background_color=$5,text_color=$6,border_radius=$7,show_rating_stars=$8,
           show_reviewer_photo=$9,show_review_date=$10,show_platform_icon=$11,min_rating=$12,
           platforms=$13::text[],max_reviews=$14,hide_no_text_reviews=$15,auto_refresh=$16,
           refresh_interval_hours=$17,is_active=$18,updated_at=CURRENT_TIMESTAMP
         WHERE id=$19 AND organization_id=$20 RETURNING ${widgetSelection}`,
        [...this.widgetParams(values), id, organizationId],
      );
      return result.rows[0];
    });
  }

  async deleteWidget(organizationId: number, id: number): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM review_widgets WHERE id=$1 AND organization_id=$2 RETURNING id',
      [id, organizationId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getWidgetKey(organizationId: number, id: number): Promise<string | null> {
    const result = await this.pool.query<{ widget_key: string }>(
      'SELECT widget_key FROM review_widgets WHERE id=$1 AND organization_id=$2',
      [id, organizationId],
    );
    return result.rows[0]?.widget_key ?? null;
  }

  async getSettings(organizationId: number): Promise<ReputationSettingsRow | null> {
    const result = await this.pool.query<ReputationSettingsRow>(
      `SELECT ${settingsSelection} FROM reputation_settings WHERE organization_id=$1`,
      [organizationId],
    );
    return result.rows[0] ?? null;
  }

  async upsertSettings(
    organizationId: number,
    prepare: (current: ReputationSettingsRow | null) => ReputationSettingsValues,
  ): Promise<ReputationSettingsRow> {
    return this.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1::int,hashtext($2))', [organizationId, 'reputation-settings']);
      const current = await client.query<ReputationSettingsRow>(
        `SELECT ${settingsSelection} FROM reputation_settings
         WHERE organization_id=$1 FOR UPDATE`, [organizationId],
      );
      const values = prepare(current.rows[0] ?? null);
      await this.validateEmailTemplate(client, organizationId, values.emailTemplateId);
      const result = await client.query<ReputationSettingsRow>(
        `INSERT INTO reputation_settings (
           organization_id,auto_request_enabled,auto_request_delay_days,auto_request_channel,
           auto_request_trigger,email_template_id,sms_template_text,negative_threshold,
           negative_alert_email,negative_route_internal,positive_route_url,default_review_url,
           google_place_id,new_review_notify_email,new_review_notify_slack,slack_webhook_url
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (organization_id) DO UPDATE SET
           auto_request_enabled=EXCLUDED.auto_request_enabled,
           auto_request_delay_days=EXCLUDED.auto_request_delay_days,
           auto_request_channel=EXCLUDED.auto_request_channel,
           auto_request_trigger=EXCLUDED.auto_request_trigger,email_template_id=EXCLUDED.email_template_id,
           sms_template_text=EXCLUDED.sms_template_text,negative_threshold=EXCLUDED.negative_threshold,
           negative_alert_email=EXCLUDED.negative_alert_email,
           negative_route_internal=EXCLUDED.negative_route_internal,
           positive_route_url=EXCLUDED.positive_route_url,default_review_url=EXCLUDED.default_review_url,
           google_place_id=EXCLUDED.google_place_id,
           new_review_notify_email=EXCLUDED.new_review_notify_email,
           new_review_notify_slack=EXCLUDED.new_review_notify_slack,
           slack_webhook_url=EXCLUDED.slack_webhook_url,updated_at=CURRENT_TIMESTAMP
         RETURNING ${settingsSelection}`,
        [organizationId, ...this.settingsParams(values)],
      );
      return result.rows[0];
    });
  }

  private widgetParams(values: ReputationWidgetValues): unknown[] {
    return [values.name, values.widgetType, values.theme, values.primaryColor,
      values.backgroundColor, values.textColor, values.borderRadius, values.showRatingStars,
      values.showReviewerPhoto, values.showReviewDate, values.showPlatformIcon, values.minRating,
      values.platforms, values.maxReviews, values.hideNoTextReviews, values.autoRefresh,
      values.refreshIntervalHours, values.isActive];
  }

  private settingsParams(values: ReputationSettingsValues): unknown[] {
    return [values.autoRequestEnabled, values.autoRequestDelayDays, values.autoRequestChannel,
      values.autoRequestTrigger, values.emailTemplateId, values.smsTemplateText,
      values.negativeThreshold, values.negativeAlertEmail, values.negativeRouteInternal,
      values.positiveRouteUrl, values.defaultReviewUrl, values.googlePlaceId,
      values.newReviewNotifyEmail, values.newReviewNotifySlack, values.slackWebhookUrl];
  }

  private async platformById(
    client: PoolClient, organizationId: number, id: number,
  ): Promise<ReputationPlatformRow> {
    const result = await client.query<ReputationPlatformRow>(
      `SELECT ${platformSelection} FROM review_platforms WHERE id=$1 AND organization_id=$2`,
      [id, organizationId],
    );
    if (!result.rows[0]) throw new Error('Saved review platform could not be reloaded');
    return result.rows[0];
  }

  private async validateEmailTemplate(
    client: PoolClient, organizationId: number, id: number | null,
  ): Promise<void> {
    if (id === null) return;
    const result = await client.query(
      'SELECT 1 FROM email_templates WHERE id=$1 AND organization_id=$2 FOR KEY SHARE',
      [id, organizationId],
    );
    if (!result.rows[0]) {
      throw new ReputationConfigurationReferenceError('emailTemplateId', 'Email template not found');
    }
  }

  private async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const value = await operation(client);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
