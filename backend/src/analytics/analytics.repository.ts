import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient, QueryResult } from 'pg';
import { PG_POOL } from '../database/database.module';

type Row = Record<string, unknown>;

export interface DashboardSnapshotRows {
  asOf: Date;
  contacts: Row;
  recentContacts: Row[];
  contactGrowth: Row[];
  deals: Row;
  dealsByStage: Row[];
  bookings: Row;
  tasks: Row;
  pipelines: Row;
  recentActivity: Row[];
  invoiceMetrics: Row;
  recentInvoices: Row[];
  signatureMetrics: Row;
  recentSignatures: Row[];
  workspaceMetrics: Row;
  recentWorkspace: Row[];
}

export interface AnalyticsQuerySnapshot<T> {
  asOf: Date;
  data: T;
}

export interface ConversionAnalyticsRows {
  dealOutcomes: Row;
  dealValues: Row[];
  formSubmissions: Row;
}

export interface RevenueAnalyticsRows {
  booked: Row[];
  collected: Row[];
}

export interface PipelineDealAgeRows {
  pipeline: Row | null;
  metrics: Row;
  stageAges: Row[];
  stageValues: Row[];
}

export interface ReputationAnalyticsRows {
  overall: Row;
  period: Row;
  ratingDistribution: Row[];
  platformDistribution: Row[];
  reviewsOverTime: Row[];
  requestStats: Row;
}

@Injectable()
export class AnalyticsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async dashboardSnapshot(organizationId: number): Promise<DashboardSnapshotRows> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const captured = await client.query<{ as_of: Date }>(
        'SELECT CURRENT_TIMESTAMP AS as_of',
      );
      const asOf = captured.rows[0]?.as_of;
      if (!(asOf instanceof Date)) throw new Error('Database did not return an analytics snapshot timestamp');
      const parameters = [organizationId, asOf];

      const contacts = await this.one(client, `
        SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'active') AS active,
          COUNT(*) FILTER (WHERE created_at >= $2::timestamptz - INTERVAL '30 days') AS new_this_month,
          COUNT(*) FILTER (WHERE created_at >= $2::timestamptz - INTERVAL '7 days') AS new_this_week
        FROM contacts WHERE organization_id = $1`, parameters);
      const recentContacts = await this.many(client, `
        SELECT id, first_name, last_name, email
        FROM contacts
        WHERE organization_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT 5`, [organizationId]);
      const contactGrowth = await this.many(client, `
        SELECT DATE_TRUNC('month', created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS month,
          COUNT(*) AS count
        FROM contacts
        WHERE organization_id = $1
          AND created_at >= $2::timestamptz - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
        ORDER BY month ASC`, parameters);
      const deals = await this.one(client, `
        SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE won_at IS NULL AND lost_at IS NULL) AS open,
          COUNT(*) FILTER (WHERE won_at IS NOT NULL) AS won,
          COUNT(*) FILTER (WHERE lost_at IS NOT NULL) AS lost
        FROM deals WHERE organization_id = $1`, [organizationId]);
      const dealsByStage = await this.many(client, `
        WITH selected_pipeline AS (
          SELECT id, stages FROM pipelines
          WHERE organization_id = $1
          ORDER BY is_default DESC, created_at ASC, id ASC LIMIT 1
        )
        SELECT d.stage_id, p.stages, COUNT(d.id) AS count
        FROM selected_pipeline p
        LEFT JOIN deals d ON d.pipeline_id = p.id
          AND d.organization_id = $1
          AND d.won_at IS NULL AND d.lost_at IS NULL
        GROUP BY d.stage_id, p.stages`, [organizationId]);
      const bookings = await this.one(client, `
        SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed,
          COUNT(*) FILTER (WHERE status = 'pending') AS pending,
          COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
          COUNT(*) FILTER (WHERE status IN ('pending', 'confirmed')
            AND start_time >= $2::timestamptz
            AND start_time <= $2::timestamptz + INTERVAL '7 days') AS upcoming_this_week,
          COUNT(*) FILTER (WHERE status IN ('pending', 'confirmed')
            AND start_time >= $2::timestamptz
            AND start_time <= $2::timestamptz + INTERVAL '1 day') AS upcoming_today
        FROM bookings WHERE organization_id = $1`, parameters);
      const tasks = await this.one(client, `
        SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'pending') AS pending,
          COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed,
          COUNT(*) FILTER (WHERE due_date < $2::timestamptz AND status != 'completed') AS overdue
        FROM tasks WHERE organization_id = $1`, parameters);
      const pipelines = await this.one(client,
        'SELECT COUNT(*) AS total FROM pipelines WHERE organization_id = $1',
        [organizationId]);
      const recentActivity = await this.many(client, `
        SELECT ca.id, ca.type, ca.title, ca.content, ca.created_at, ca.contact_id
        FROM contact_activities ca
        JOIN contacts c ON c.id = ca.contact_id AND c.organization_id = $1
        ORDER BY ca.created_at DESC, ca.id DESC LIMIT 10`, [organizationId]);
      const invoiceMetrics = await this.one(client, `
        SELECT COUNT(*) FILTER (WHERE status IN ('sent', 'viewed', 'partial')) AS pending,
          COUNT(*) FILTER (WHERE status = 'overdue') AS overdue,
          COALESCE(SUM(total) FILTER (WHERE paid_at IS NOT NULL
            AND DATE_TRUNC('month', paid_at AT TIME ZONE 'UTC') =
                DATE_TRUNC('month', $2::timestamptz AT TIME ZONE 'UTC')), 0) AS paid_this_month,
          COUNT(*) FILTER (WHERE DATE_TRUNC('month', created_at AT TIME ZONE 'UTC') =
            DATE_TRUNC('month', $2::timestamptz AT TIME ZONE 'UTC')) AS invoice_count_this_month
        FROM invoices WHERE organization_id = $1`, parameters);
      const recentInvoices = await this.many(client, `
        SELECT id, invoice_number, total, status
        FROM invoices WHERE organization_id = $1
        ORDER BY created_at DESC, id DESC LIMIT 5`, [organizationId]);
      const signatureMetrics = await this.one(client, `
        SELECT COUNT(*) FILTER (WHERE status IN ('sent', 'in_progress')) AS awaiting_signatures,
          COUNT(*) FILTER (WHERE status = 'completed' AND
            DATE_TRUNC('week', completed_at AT TIME ZONE 'UTC') =
            DATE_TRUNC('week', $2::timestamptz AT TIME ZONE 'UTC')) AS signed_this_week,
          COUNT(*) AS total_signatures
        FROM signature_documents WHERE organization_id = $1`, parameters);
      const recentSignatures = await this.many(client, `
        SELECT id, title, status, created_at
        FROM signature_documents WHERE organization_id = $1
        ORDER BY created_at DESC, id DESC LIMIT 5`, [organizationId]);
      const workspaceMetrics = await this.one(client, `
        SELECT 0 AS active_items,
          (SELECT COUNT(*) FROM lists WHERE organization_id = $1) AS lists_count,
          (SELECT COUNT(*) FROM notes WHERE organization_id = $1) AS notes_count`, [organizationId]);
      const recentWorkspace = await this.many(client, `
        SELECT type, title, created_at FROM (
          SELECT 'list' AS type, id, title, created_at FROM lists WHERE organization_id = $1
          UNION ALL
          SELECT 'note' AS type, id, title, created_at FROM notes WHERE organization_id = $1
        ) merged ORDER BY created_at DESC, id DESC LIMIT 5`, [organizationId]);

      await client.query('COMMIT');
      return {
        asOf, contacts, recentContacts, contactGrowth, deals, dealsByStage, bookings, tasks,
        pipelines, recentActivity, invoiceMetrics, recentInvoices,
        signatureMetrics, recentSignatures, workspaceMetrics, recentWorkspace,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  contactTrends(
    organizationId: number,
    interval: string,
    groupBy: string,
  ): Promise<AnalyticsQuerySnapshot<Row[]>> {
    return this.withSnapshot(async (client, asOf) => this.many(client, `
      SELECT
        DATE_TRUNC($1, created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS period,
        COUNT(*) AS new_contacts,
        COUNT(*) FILTER (WHERE source IS NOT NULL) AS with_source
      FROM contacts
      WHERE organization_id = $2
        AND created_at >= $3::timestamptz - $4::interval
        AND created_at < $3::timestamptz
      GROUP BY DATE_TRUNC($1, created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      ORDER BY period ASC`, [groupBy, organizationId, asOf, interval]));
  }

  dealPerformance(
    organizationId: number,
    interval: string,
  ): Promise<AnalyticsQuerySnapshot<Row>> {
    return this.withSnapshot(async (client, asOf) => this.one(client, `
      SELECT
        COUNT(*) FILTER (WHERE won_at IS NOT NULL OR lost_at IS NOT NULL) AS closed_total,
        COUNT(*) FILTER (WHERE won_at IS NOT NULL) AS won_count,
        COUNT(*) FILTER (WHERE lost_at IS NOT NULL) AS lost_count,
        COALESCE(AVG(value) FILTER (WHERE won_at IS NOT NULL), 0) AS avg_deal_value,
        COALESCE(SUM(value) FILTER (WHERE won_at IS NOT NULL), 0) AS total_revenue,
        COALESCE(AVG(EXTRACT(EPOCH FROM (won_at - created_at)) / 86400)
          FILTER (WHERE won_at IS NOT NULL), 0) AS avg_days_to_close
      FROM deals
      WHERE organization_id = $1
        AND ((won_at >= $2::timestamptz - $3::interval AND won_at < $2::timestamptz)
          OR (lost_at >= $2::timestamptz - $3::interval AND lost_at < $2::timestamptz))`,
    [organizationId, asOf, interval]));
  }

  conversionRates(
    organizationId: number,
    interval: string,
  ): Promise<AnalyticsQuerySnapshot<ConversionAnalyticsRows>> {
    return this.withSnapshot(async (client, asOf) => {
      const values = [organizationId, asOf, interval];
      const dealOutcomes = await this.one(client, `
        SELECT COUNT(*) AS total_closed,
          COUNT(*) FILTER (WHERE won_at IS NOT NULL) AS won,
          COUNT(*) FILTER (WHERE lost_at IS NOT NULL) AS lost
        FROM deals
        WHERE organization_id = $1
          AND ((won_at >= $2::timestamptz - $3::interval
              AND won_at < $2::timestamptz)
            OR (lost_at >= $2::timestamptz - $3::interval
              AND lost_at < $2::timestamptz))`, values);
      const dealValues = await this.many(client, `
        SELECT COALESCE(NULLIF(UPPER(TRIM(currency)), ''), 'USD') AS currency,
          COALESCE(SUM(value) FILTER (WHERE won_at IS NOT NULL), 0) AS won_value,
          COALESCE(SUM(value) FILTER (WHERE lost_at IS NOT NULL), 0) AS lost_value
        FROM deals
        WHERE organization_id = $1
          AND ((won_at >= $2::timestamptz - $3::interval
              AND won_at < $2::timestamptz)
            OR (lost_at >= $2::timestamptz - $3::interval
              AND lost_at < $2::timestamptz))
        GROUP BY COALESCE(NULLIF(UPPER(TRIM(currency)), ''), 'USD')
        ORDER BY currency ASC`, values);
      const formSubmissions = await this.one(client, `
        SELECT COUNT(*) AS submissions,
          COUNT(*) FILTER (WHERE contact_id IS NOT NULL) AS converted
        FROM form_submissions
        WHERE organization_id = $1
          AND created_at >= $2::timestamptz - $3::interval
          AND created_at < $2::timestamptz`, values);
      return { dealOutcomes, dealValues, formSubmissions };
    });
  }

  revenueTrends(
    organizationId: number,
    interval: string,
    groupBy: string,
  ): Promise<AnalyticsQuerySnapshot<RevenueAnalyticsRows>> {
    return this.withSnapshot(async (client, asOf) => {
      const values = [groupBy, organizationId, asOf, interval];
      const booked = await this.many(client, `
        SELECT
          DATE_TRUNC($1, won_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS period,
          COALESCE(NULLIF(UPPER(TRIM(currency)), ''), 'USD') AS currency,
          COUNT(*) AS deals_won,
          COALESCE(SUM(value), 0) AS booked_revenue
        FROM deals
        WHERE organization_id = $2
          AND won_at >= $3::timestamptz - $4::interval
          AND won_at < $3::timestamptz
        GROUP BY
          DATE_TRUNC($1, won_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
          COALESCE(NULLIF(UPPER(TRIM(currency)), ''), 'USD')
        ORDER BY currency ASC, period ASC`, values);
      const collected = await this.many(client, `
        SELECT
          DATE_TRUNC($1, paid_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS period,
          COALESCE(NULLIF(UPPER(TRIM(currency)), ''), 'USD') AS currency,
          COUNT(*) AS payments_count,
          COALESCE(SUM(amount), 0) AS collected_revenue
        FROM payments
        WHERE organization_id = $2
          AND status = 'succeeded'
          AND paid_at >= $3::timestamptz - $4::interval
          AND paid_at < $3::timestamptz
        GROUP BY
          DATE_TRUNC($1, paid_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
          COALESCE(NULLIF(UPPER(TRIM(currency)), ''), 'USD')
        ORDER BY currency ASC, period ASC`, values);
      return { booked, collected };
    });
  }

  pipelineDealAge(
    organizationId: number,
    pipelineId?: number,
  ): Promise<AnalyticsQuerySnapshot<PipelineDealAgeRows>> {
    return this.withSnapshot(async (client, asOf) => {
      const pipeline = await this.one(client, `
        SELECT id, name, stages
        FROM pipelines
        WHERE organization_id = $1
          AND ($2::int IS NULL OR id = $2)
        ORDER BY is_default DESC, created_at ASC, id ASC
        LIMIT 1`, [organizationId, pipelineId ?? null]);
      if (pipeline.id === undefined) {
        return { pipeline: null, metrics: {}, stageAges: [], stageValues: [] };
      }
      const selectedPipelineId = Number(pipeline.id);
      const metrics = await this.one(client, `
        SELECT
          COUNT(*) FILTER (WHERE won_at IS NOT NULL) AS won_count,
          COUNT(*) FILTER (WHERE lost_at IS NOT NULL) AS lost_count,
          COUNT(*) FILTER (WHERE won_at IS NULL AND lost_at IS NULL) AS open_count,
          COALESCE(AVG(EXTRACT(EPOCH FROM (won_at - created_at)) / 86400)
            FILTER (WHERE won_at IS NOT NULL), 0) AS average_days_to_win,
          COALESCE(AVG(EXTRACT(EPOCH FROM (lost_at - created_at)) / 86400)
            FILTER (WHERE lost_at IS NOT NULL), 0) AS average_days_to_lose
        FROM deals
        WHERE organization_id = $1 AND pipeline_id = $2`,
      [organizationId, selectedPipelineId]);
      const stageAges = await this.many(client, `
        SELECT stage_id, COUNT(*) AS open_deal_count,
          COALESCE(AVG(EXTRACT(EPOCH FROM ($3::timestamptz - created_at)) / 86400), 0)
            AS average_open_deal_age_days
        FROM deals
        WHERE organization_id = $1
          AND pipeline_id = $2
          AND won_at IS NULL
          AND lost_at IS NULL
        GROUP BY stage_id
        ORDER BY stage_id ASC`, [organizationId, selectedPipelineId, asOf]);
      const stageValues = await this.many(client, `
        SELECT stage_id,
          COALESCE(NULLIF(UPPER(TRIM(currency)), ''), 'USD') AS currency,
          COALESCE(SUM(value), 0) AS amount
        FROM deals
        WHERE organization_id = $1
          AND pipeline_id = $2
          AND won_at IS NULL
          AND lost_at IS NULL
        GROUP BY stage_id, COALESCE(NULLIF(UPPER(TRIM(currency)), ''), 'USD')
        ORDER BY stage_id ASC, currency ASC`, [organizationId, selectedPipelineId]);
      return { pipeline, metrics, stageAges, stageValues };
    });
  }

  bookingAnalytics(organizationId: number): Promise<AnalyticsQuerySnapshot<Row>> {
    return this.withSnapshot(async (client, asOf) => this.one(client, `
      SELECT COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed,
        COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
        COUNT(*) FILTER (WHERE status = 'no_show') AS no_show,
        COUNT(*) FILTER (WHERE created_at >= $2::timestamptz - INTERVAL '30 days'
          AND created_at < $2::timestamptz) AS created_this_month,
        COUNT(*) FILTER (WHERE start_time >= $2::timestamptz
          AND status IN ('pending', 'confirmed')) AS upcoming
      FROM bookings WHERE organization_id = $1`, [organizationId, asOf]));
  }

  communicationStats(
    organizationId: number,
    interval: string,
  ): Promise<AnalyticsQuerySnapshot<{ email: Row; sms: Row }>> {
    return this.withSnapshot(async (client, asOf) => {
      const values = [organizationId, asOf, interval];
      const email = await this.one(client, `
        SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status IN ('sent', 'delivered', 'opened', 'clicked')) AS sent,
          COUNT(*) FILTER (WHERE status IN ('delivered', 'opened', 'clicked')) AS delivered,
          COUNT(*) FILTER (WHERE status IN ('opened', 'clicked')) AS opened,
          COUNT(*) FILTER (WHERE status = 'clicked') AS clicked,
          COUNT(*) FILTER (WHERE status = 'bounced') AS bounced,
          COUNT(*) FILTER (WHERE status = 'failed') AS failed
        FROM email_logs
        WHERE organization_id = $1
          AND queued_at >= $2::timestamptz - $3::interval
          AND queued_at < $2::timestamptz`, values);
      const sms = await this.one(client, `
        SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE direction = 'outbound') AS outbound,
          COUNT(*) FILTER (WHERE direction = 'inbound') AS inbound,
          COUNT(*) FILTER (WHERE direction = 'outbound'
            AND status IN ('sent', 'delivered')) AS sent,
          COUNT(*) FILTER (WHERE direction = 'outbound' AND status = 'delivered') AS delivered,
          COUNT(*) FILTER (WHERE direction = 'outbound' AND status = 'failed') AS failed,
          COALESCE(SUM(segments) FILTER (WHERE direction = 'outbound'), 0) AS total_segments
        FROM sms_logs
        WHERE organization_id = $1
          AND queued_at >= $2::timestamptz - $3::interval
          AND queued_at < $2::timestamptz`, values);
      return { email, sms };
    });
  }

  workflowPerformance(organizationId: number): Promise<AnalyticsQuerySnapshot<Row[]>> {
    return this.withSnapshot(async (client) => this.many(client, `
      SELECT w.id, w.name, w.trigger_type, w.is_active, w.stats,
        COUNT(DISTINCT we.id) AS total_enrollments,
        COUNT(DISTINCT we.id) FILTER (WHERE we.status = 'completed') AS completed,
        COUNT(DISTINCT we.id) FILTER (WHERE we.status = 'active') AS active,
        COUNT(DISTINCT we.id) FILTER (WHERE we.status = 'failed') AS failed
      FROM workflows w
      LEFT JOIN workflow_enrollments we ON we.workflow_id = w.id
        AND EXISTS (
          SELECT 1 FROM contacts c
          WHERE c.id = we.contact_id AND c.organization_id = $1
        )
      WHERE w.organization_id = $1
      GROUP BY w.id, w.name, w.trigger_type, w.is_active, w.stats
      ORDER BY total_enrollments DESC, w.id ASC`, [organizationId]));
  }

  reputationAnalytics(
    organizationId: number,
    days: number,
  ): Promise<AnalyticsQuerySnapshot<ReputationAnalyticsRows>> {
    return this.withSnapshot(async (client, asOf) => {
      const overall = await this.one(client, `
        SELECT COUNT(*) AS total_reviews,
          COALESCE(AVG(rating), 0) AS average_rating,
          COUNT(*) FILTER (WHERE rating >= 4) AS positive_reviews,
          COUNT(*) FILTER (WHERE rating <= 2) AS negative_reviews,
          COUNT(*) FILTER (WHERE status = 'new') AS new_reviews,
          COUNT(*) FILTER (WHERE status = 'responded') AS responded_reviews
        FROM reviews
        WHERE organization_id = $1`, [organizationId]);
      const period = await this.one(client, `
        SELECT COUNT(*) AS reviews_count,
          COALESCE(AVG(rating), 0) AS average_rating
        FROM reviews
        WHERE organization_id = $1
          AND review_date >= $2::timestamptz - ($3::int * INTERVAL '1 day')`,
      [organizationId, asOf, days]);
      const ratingDistribution = await this.many(client, `
        SELECT rating, COUNT(*) AS count
        FROM reviews
        WHERE organization_id = $1
        GROUP BY rating
        ORDER BY rating DESC`, [organizationId]);
      const platformDistribution = await this.many(client, `
        SELECT platform, COUNT(*) AS count, COALESCE(AVG(rating), 0) AS average_rating
        FROM reviews
        WHERE organization_id = $1
        GROUP BY platform
        ORDER BY count DESC, platform ASC`, [organizationId]);
      const reviewsOverTime = await this.many(client, `
        SELECT DATE_TRUNC('day', review_date AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS date,
          COUNT(*) AS count, COALESCE(AVG(rating), 0) AS average_rating
        FROM reviews
        WHERE organization_id = $1
          AND review_date >= $2::timestamptz - INTERVAL '30 days'
        GROUP BY DATE_TRUNC('day', review_date AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
        ORDER BY date ASC`, [organizationId, asOf]);
      const requestStats = await this.one(client, `
        SELECT COUNT(*) AS total_sent,
          COUNT(*) FILTER (WHERE clicked = TRUE) AS clicked,
          COUNT(*) FILTER (WHERE review_submitted = TRUE) AS converted
        FROM review_requests
        WHERE organization_id = $1
          AND created_at >= $2::timestamptz - ($3::int * INTERVAL '1 day')`,
      [organizationId, asOf, days]);
      return {
        overall, period, ratingDistribution, platformDistribution,
        reviewsOverTime, requestStats,
      };
    });
  }

  private async withSnapshot<T>(
    callback: (client: PoolClient, asOf: Date) => Promise<T>,
  ): Promise<AnalyticsQuerySnapshot<T>> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const captured = await client.query<{ as_of: Date }>('SELECT CURRENT_TIMESTAMP AS as_of');
      const asOf = captured.rows[0]?.as_of;
      if (!(asOf instanceof Date)) throw new Error('Database did not return an analytics snapshot timestamp');
      const data = await callback(client, asOf);
      await client.query('COMMIT');
      return { asOf, data };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async one(
    client: PoolClient,
    text: string,
    values: unknown[],
  ): Promise<Row> {
    const result = await client.query<Row>(text, values);
    return result.rows[0] ?? {};
  }

  private async many(
    client: PoolClient,
    text: string,
    values: unknown[],
  ): Promise<Row[]> {
    const result: QueryResult<Row> = await client.query<Row>(text, values);
    return result.rows;
  }
}
