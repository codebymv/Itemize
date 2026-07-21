import { Injectable } from '@nestjs/common';
import { AnalyticsRepository, DashboardSnapshotRows } from './analytics.repository';
import {
  DashboardAnalytics,
  DashboardFunnelStage,
} from './analytics.types';

type StageDefinition = { id: string; name: string; color: string };

@Injectable()
export class AnalyticsService {
  constructor(private readonly analytics: AnalyticsRepository) {}

  async dashboard(organizationId: number): Promise<DashboardAnalytics> {
    const snapshot = await this.analytics.dashboardSnapshot(organizationId);
    const bookedValue = this.number(snapshot.deals.booked_value, 'deals.bookedValue');
    const bookedThisMonth = this.number(
      snapshot.deals.booked_this_month,
      'deals.bookedThisMonth',
    );
    const collectedValue = this.number(
      snapshot.payments.collected_value,
      'deals.collectedValue',
    );
    const collectedThisMonth = this.number(
      snapshot.payments.collected_this_month,
      'deals.collectedThisMonth',
    );

    return {
      asOf: snapshot.asOf,
      reportingTimezone: 'UTC',
      contacts: {
        total: this.count(snapshot.contacts.total, 'contacts.total'),
        active: this.count(snapshot.contacts.active, 'contacts.active'),
        leads: this.count(snapshot.contacts.leads, 'contacts.leads'),
        customers: this.count(snapshot.contacts.customers, 'contacts.customers'),
        newThisMonth: this.count(
          snapshot.contacts.new_this_month,
          'contacts.newThisMonth',
        ),
        newThisWeek: this.count(
          snapshot.contacts.new_this_week,
          'contacts.newThisWeek',
        ),
        growth: snapshot.contactGrowth.map((row) => ({
          month: this.date(row.month, 'contacts.growth.month').toISOString(),
          count: this.count(row.count, 'contacts.growth.count'),
        })),
      },
      deals: {
        total: this.count(snapshot.deals.total, 'deals.total'),
        open: this.count(snapshot.deals.open, 'deals.open'),
        won: this.count(snapshot.deals.won, 'deals.won'),
        lost: this.count(snapshot.deals.lost, 'deals.lost'),
        openValue: this.number(snapshot.deals.open_value, 'deals.openValue'),
        wonValue: bookedValue + collectedValue,
        wonThisMonth: bookedThisMonth + collectedThisMonth,
        bookedValue,
        bookedThisMonth,
        collectedValue,
        collectedThisMonth,
        funnel: this.funnel(snapshot),
      },
      bookings: {
        total: this.count(snapshot.bookings.total, 'bookings.total'),
        confirmed: this.count(snapshot.bookings.confirmed, 'bookings.confirmed'),
        pending: this.count(snapshot.bookings.pending, 'bookings.pending'),
        cancelled: this.count(snapshot.bookings.cancelled, 'bookings.cancelled'),
        upcomingThisWeek: this.count(
          snapshot.bookings.upcoming_this_week,
          'bookings.upcomingThisWeek',
        ),
        upcomingToday: this.count(
          snapshot.bookings.upcoming_today,
          'bookings.upcomingToday',
        ),
      },
      tasks: {
        total: this.count(snapshot.tasks.total, 'tasks.total'),
        pending: this.count(snapshot.tasks.pending, 'tasks.pending'),
        inProgress: this.count(snapshot.tasks.in_progress, 'tasks.inProgress'),
        completed: this.count(snapshot.tasks.completed, 'tasks.completed'),
        overdue: this.count(snapshot.tasks.overdue, 'tasks.overdue'),
      },
      pipelines: {
        total: this.count(snapshot.pipelines.total, 'pipelines.total'),
      },
      recentActivity: snapshot.recentActivity.map((row) => ({
        id: this.id(row.id, 'recentActivity.id'),
        type: this.string(row.type, 'recentActivity.type'),
        title: this.string(row.title, 'recentActivity.title'),
        content: row.content ?? null,
        createdAt: this.date(row.created_at, 'recentActivity.createdAt'),
        contactId: row.contact_id === null || row.contact_id === undefined
          ? null
          : this.id(row.contact_id, 'recentActivity.contactId'),
      })),
      invoiceMetrics: {
        pending: this.count(snapshot.invoiceMetrics.pending, 'invoiceMetrics.pending'),
        overdue: this.count(snapshot.invoiceMetrics.overdue, 'invoiceMetrics.overdue'),
        paidThisMonth: this.number(
          snapshot.invoiceMetrics.paid_this_month,
          'invoiceMetrics.paidThisMonth',
        ),
        countThisMonth: this.count(
          snapshot.invoiceMetrics.invoice_count_this_month,
          'invoiceMetrics.countThisMonth',
        ),
        recentInvoices: snapshot.recentInvoices.map((row) => {
          const id = this.id(row.id, 'invoiceMetrics.recentInvoices.id');
          return {
            id,
            number: this.optionalString(row.invoice_number) ?? `INV-${id}`,
            amount: this.number(row.total, 'invoiceMetrics.recentInvoices.amount'),
            status: this.optionalString(row.status) ?? 'draft',
          };
        }),
      },
      signatureMetrics: {
        awaiting: this.count(
          snapshot.signatureMetrics.awaiting_signatures,
          'signatureMetrics.awaiting',
        ),
        signedThisWeek: this.count(
          snapshot.signatureMetrics.signed_this_week,
          'signatureMetrics.signedThisWeek',
        ),
        total: this.count(
          snapshot.signatureMetrics.total_signatures,
          'signatureMetrics.total',
        ),
        recentDocuments: snapshot.recentSignatures.map((row) => ({
          id: this.id(row.id, 'signatureMetrics.recentDocuments.id'),
          title: this.optionalString(row.title) ?? 'Document',
          status: this.optionalString(row.status) ?? 'draft',
          date: this.date(row.created_at, 'signatureMetrics.recentDocuments.date'),
        })),
      },
      workspaceMetrics: {
        activeItems: this.count(
          snapshot.workspaceMetrics.active_items,
          'workspaceMetrics.activeItems',
        ),
        lists: this.count(snapshot.workspaceMetrics.lists_count, 'workspaceMetrics.lists'),
        notes: this.count(snapshot.workspaceMetrics.notes_count, 'workspaceMetrics.notes'),
        recentItems: snapshot.recentWorkspace.map((row) => ({
          type: this.string(row.type, 'workspaceMetrics.recentItems.type'),
          title: this.optionalString(row.title) ?? 'Item',
          date: this.date(row.created_at, 'workspaceMetrics.recentItems.date'),
        })),
      },
    };
  }

  private funnel(snapshot: DashboardSnapshotRows): DashboardFunnelStage[] {
    const stages = this.stages(snapshot.dealsByStage[0]?.stages);
    const values = new Map<string, { count: number; value: number }>();
    for (const row of snapshot.dealsByStage) {
      if (typeof row.stage_id !== 'string') continue;
      values.set(row.stage_id, {
        count: this.count(row.count, `deals.funnel.${row.stage_id}.dealCount`),
        value: this.number(row.total_value, `deals.funnel.${row.stage_id}.totalValue`),
      });
    }
    return stages.map((stage) => ({
      stageId: stage.id,
      stageName: stage.name,
      stageColor: stage.color,
      dealCount: values.get(stage.id)?.count ?? 0,
      totalValue: values.get(stage.id)?.value ?? 0,
    }));
  }

  private stages(value: unknown): StageDefinition[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((stage) => {
      if (!stage || typeof stage !== 'object') return [];
      const candidate = stage as Record<string, unknown>;
      if (typeof candidate.id !== 'string' || candidate.id.length === 0) return [];
      return [{
        id: candidate.id,
        name: typeof candidate.name === 'string' && candidate.name
          ? candidate.name
          : candidate.id,
        color: typeof candidate.color === 'string' && candidate.color
          ? candidate.color
          : '#6B7280',
      }];
    });
  }

  private count(value: unknown, field: string): number {
    const parsed = Number(value ?? 0);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new Error(`Unsafe analytics count at ${field}`);
    }
    return parsed;
  }

  private id(value: unknown, field: string): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 2_147_483_647) {
      throw new Error(`Unsafe analytics identifier at ${field}`);
    }
    return parsed;
  }

  private number(value: unknown, field: string): number {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed)) throw new Error(`Unsafe analytics number at ${field}`);
    return parsed;
  }

  private date(value: unknown, field: string): Date {
    const parsed = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid analytics date at ${field}`);
    return parsed;
  }

  private string(value: unknown, field: string): string {
    if (typeof value !== 'string') throw new Error(`Invalid analytics string at ${field}`);
    return value;
  }

  private optionalString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
  }
}
