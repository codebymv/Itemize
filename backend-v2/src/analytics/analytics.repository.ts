import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient, QueryResult } from 'pg';
import { PG_POOL } from '../database/database.module';

type Row = Record<string, unknown>;

export interface DashboardSnapshotRows {
  asOf: Date;
  contacts: Row;
  contactGrowth: Row[];
  deals: Row;
  dealsByStage: Row[];
  bookings: Row;
  tasks: Row;
  pipelines: Row;
  recentActivity: Row[];
  payments: Row;
  invoiceMetrics: Row;
  recentInvoices: Row[];
  signatureMetrics: Row;
  recentSignatures: Row[];
  workspaceMetrics: Row;
  recentWorkspace: Row[];
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
          COUNT(*) FILTER (WHERE status = 'lead') AS leads,
          COUNT(*) FILTER (WHERE status = 'customer') AS customers,
          COUNT(*) FILTER (WHERE created_at >= $2::timestamptz - INTERVAL '30 days') AS new_this_month,
          COUNT(*) FILTER (WHERE created_at >= $2::timestamptz - INTERVAL '7 days') AS new_this_week
        FROM contacts WHERE organization_id = $1`, parameters);
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
          COUNT(*) FILTER (WHERE lost_at IS NOT NULL) AS lost,
          COALESCE(SUM(value) FILTER (WHERE won_at IS NULL AND lost_at IS NULL), 0) AS open_value,
          COALESCE(SUM(value) FILTER (WHERE won_at IS NOT NULL), 0) AS booked_value,
          COALESCE(SUM(value) FILTER (
            WHERE won_at IS NOT NULL AND won_at >= $2::timestamptz - INTERVAL '30 days'
          ), 0) AS booked_this_month
        FROM deals WHERE organization_id = $1`, parameters);
      const dealsByStage = await this.many(client, `
        WITH selected_pipeline AS (
          SELECT id, stages FROM pipelines
          WHERE organization_id = $1
          ORDER BY is_default DESC, created_at ASC, id ASC LIMIT 1
        )
        SELECT d.stage_id, p.stages, COUNT(d.id) AS count,
          COALESCE(SUM(d.value), 0) AS total_value
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
      const payments = await this.one(client, `
        SELECT COALESCE(SUM(amount), 0) AS collected_value,
          COALESCE(SUM(amount) FILTER (
            WHERE paid_at >= $2::timestamptz - INTERVAL '30 days'
          ), 0) AS collected_this_month
        FROM payments WHERE organization_id = $1 AND status = 'succeeded'`, parameters);
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
        asOf, contacts, contactGrowth, deals, dealsByStage, bookings, tasks,
        pipelines, recentActivity, payments, invoiceMetrics, recentInvoices,
        signatureMetrics, recentSignatures, workspaceMetrics, recentWorkspace,
      };
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
