import { AnalyticsRepository, DashboardSnapshotRows } from './analytics.repository';
import { AnalyticsService } from './analytics.service';
import {
  CommunicationAnalyticsPeriod,
  ContactAnalyticsPeriod,
  ConversionAnalyticsPeriod,
  DealAnalyticsPeriod,
  RevenueAnalyticsPeriod,
} from './analytics.enums';

const snapshot = (extra: Partial<DashboardSnapshotRows> = {}): DashboardSnapshotRows => ({
  asOf: new Date('2026-07-20T18:00:00.000Z'),
  contacts: {
    total: '2', active: '1',
    new_this_month: '1', new_this_week: '1',
  },
  recentContacts: [{
    id: 3, first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.test',
  }],
  contactGrowth: [{ month: new Date('2026-07-01T00:00:00.000Z'), count: '1' }],
  deals: {
    total: '3', open: '2', won: '1', lost: '0',
  },
  dealsByStage: [
    {
      stage_id: 'proposal',
      stages: [
        { id: 'qualified', name: 'Qualified', color: '#112233' },
        { id: 'proposal', name: 'Proposal', color: '#445566' },
      ],
      count: '2',
    },
  ],
  bookings: {
    total: '2', confirmed: '1', pending: '0', cancelled: '1',
    upcoming_this_week: '1', upcoming_today: '1',
  },
  tasks: { total: '0', pending: '0', in_progress: '0', completed: '0', overdue: '0' },
  pipelines: { total: '2' },
  recentActivity: [{
    id: 8, type: 'system', title: 'Created', content: { action: 'created' },
    created_at: new Date('2026-07-20T17:00:00.000Z'), contact_id: 3,
  }],
  invoiceMetrics: {
    pending: '1', overdue: '0', paid_this_month: '0', invoice_count_this_month: '1',
  },
  recentInvoices: [{ id: 12, invoice_number: null, total: '20.50', status: 'sent' }],
  signatureMetrics: { awaiting_signatures: '0', signed_this_week: '0', total_signatures: '0' },
  recentSignatures: [],
  workspaceMetrics: { active_items: 0, lists_count: '0', notes_count: '0' },
  recentWorkspace: [],
  ...extra,
});

describe('AnalyticsService', () => {
  let repository: jest.Mocked<AnalyticsRepository>;
  let service: AnalyticsService;

  beforeEach(() => {
    repository = {
      dashboardSnapshot: jest.fn(),
      contactTrends: jest.fn(),
      dealPerformance: jest.fn(),
      bookingAnalytics: jest.fn(),
      communicationStats: jest.fn(),
      conversionRates: jest.fn(),
      revenueTrends: jest.fn(),
      pipelineDealAge: jest.fn(),
      workflowPerformance: jest.fn(),
      reputationAnalytics: jest.fn(),
    } as unknown as jest.Mocked<AnalyticsRepository>;
    service = new AnalyticsService(repository);
  });

  it('normalizes PostgreSQL counts without exposing misleading dashboard money totals', async () => {
    repository.dashboardSnapshot.mockResolvedValue(snapshot());
    await expect(service.dashboard(4)).resolves.toMatchObject({
      asOf: new Date('2026-07-20T18:00:00.000Z'),
      reportingTimezone: 'UTC',
      contacts: {
        total: 2,
        active: 1,
        recentContacts: [{ id: 3, name: 'Ada Lovelace', email: 'ada@example.test' }],
      },
      deals: { total: 3, open: 2, won: 1, lost: 0 },
      invoiceMetrics: {
        recentInvoices: [{ id: 12, number: 'INV-12', amount: 20.5 }],
      },
    });
    expect(repository.dashboardSnapshot).toHaveBeenCalledWith(4);
  });

  it('emits configured zero-value stages in pipeline order', async () => {
    repository.dashboardSnapshot.mockResolvedValue(snapshot());
    const result = await service.dashboard(4);
    expect(result.deals.funnel).toEqual([
      {
        stageId: 'qualified', stageName: 'Qualified', stageColor: '#112233',
        dealCount: 0,
      },
      {
        stageId: 'proposal', stageName: 'Proposal', stageColor: '#445566',
        dealCount: 2,
      },
    ]);
  });

  it('fails closed on unsafe counts instead of overflowing the GraphQL number', async () => {
    repository.dashboardSnapshot.mockResolvedValue(snapshot({
      contacts: { ...snapshot().contacts, total: '9007199254740992' },
    }));
    await expect(service.dashboard(4)).rejects.toThrow(
      'Unsafe analytics count at contacts.total',
    );
  });

  it('maps the typed contact period and emits UTC bucket boundaries', async () => {
    repository.contactTrends.mockResolvedValue({
      asOf: new Date('2026-07-20T18:00:00.000Z'),
      data: [{ period: new Date('2026-07-20T00:00:00.000Z'), new_contacts: '3', with_source: '2' }],
    });
    await expect(service.contactTrends(4, ContactAnalyticsPeriod.DAYS_7)).resolves.toEqual({
      asOf: new Date('2026-07-20T18:00:00.000Z'),
      reportingTimezone: 'UTC',
      period: '7days',
      data: [{ period: '2026-07-20T00:00:00.000Z', newContacts: 3, withSource: 2 }],
    });
    expect(repository.contactTrends).toHaveBeenCalledWith(4, '7 days', 'day');
  });

  it('derives deal win rate and rounds average close duration', async () => {
    repository.dealPerformance.mockResolvedValue({
      asOf: new Date('2026-07-20T18:00:00.000Z'),
      data: {
        closed_total: '3', won_count: '2', lost_count: '1', avg_deal_value: '125.50',
        total_revenue: '251.00', avg_days_to_close: '4.6',
      },
    });
    await expect(service.dealPerformance(4, DealAnalyticsPeriod.DAYS_30)).resolves.toMatchObject({
      period: '30days',
      metrics: { closedTotal: 3, wonCount: 2, lostCount: 1, winRate: 67, avgDealValue: 125.5, totalRevenue: 251, avgDaysToClose: 5 },
    });
    expect(repository.dealPerformance).toHaveBeenCalledWith(4, '30 days');
  });

  it('bases booking completion rate only on completed and no-show outcomes', async () => {
    repository.bookingAnalytics.mockResolvedValue({
      asOf: new Date('2026-07-20T18:00:00.000Z'),
      data: {
        total: '10', confirmed: '2', completed: '3', cancelled: '4', no_show: '1',
        created_this_month: '5', upcoming: '2',
      },
    });
    await expect(service.bookingAnalytics(4)).resolves.toMatchObject({
      total: 10, completed: 3, cancelled: 4, noShow: 1, completionRate: 75,
    });
  });

  it('reports only real deal and form conversions with currency-separated values', async () => {
    repository.conversionRates.mockResolvedValue({
      asOf: new Date('2026-07-20T18:00:00.000Z'),
      data: {
        dealOutcomes: { total_closed: '3', won: '2', lost: '1' },
        dealValues: [
          { currency: 'EUR', won_value: '80', lost_value: '20' },
          { currency: 'USD', won_value: '125.50', lost_value: '40' },
        ],
        formSubmissions: { submissions: '4', converted: '3' },
      },
    });
    await expect(
      service.conversionRates(4, ConversionAnalyticsPeriod.DAYS_90),
    ).resolves.toEqual({
      asOf: new Date('2026-07-20T18:00:00.000Z'),
      reportingTimezone: 'UTC',
      period: '90days',
      dealWinRate: {
        rate: 67,
        won: 2,
        lost: 1,
        totalClosed: 3,
        valuesByCurrency: [
          { currency: 'EUR', wonValue: 80, lostValue: 20 },
          { currency: 'USD', wonValue: 125.5, lostValue: 40 },
        ],
      },
      formToContact: { rate: 75, submissions: 4, converted: 3 },
    });
    expect(repository.conversionRates).toHaveBeenCalledWith(4, '90 days');
  });

  it('keeps booked and collected revenue separate for every currency and bucket', async () => {
    repository.revenueTrends.mockResolvedValue({
      asOf: new Date('2026-07-20T18:00:00.000Z'),
      data: {
        booked: [
          {
            period: new Date('2026-06-01T00:00:00.000Z'),
            currency: 'USD',
            deals_won: '1',
            booked_revenue: '100',
          },
          {
            period: new Date('2026-07-01T00:00:00.000Z'),
            currency: 'USD',
            deals_won: '2',
            booked_revenue: '150',
          },
        ],
        collected: [
          {
            period: new Date('2026-07-01T00:00:00.000Z'),
            currency: 'EUR',
            payments_count: '1',
            collected_revenue: '40',
          },
          {
            period: new Date('2026-07-01T00:00:00.000Z'),
            currency: 'USD',
            payments_count: '1',
            collected_revenue: '75',
          },
        ],
      },
    });
    const result = await service.revenueTrends(4, RevenueAnalyticsPeriod.MONTHS_6);
    expect(result).toMatchObject({
      period: '6months',
      reportingTimezone: 'UTC',
      currencies: [
        {
          currency: 'EUR',
          summary: {
            totalBookedRevenue: 0,
            totalCollectedRevenue: 40,
            totalDeals: 0,
            totalPayments: 1,
          },
        },
        {
          currency: 'USD',
          summary: {
            totalBookedRevenue: 250,
            totalCollectedRevenue: 75,
            totalDeals: 3,
            totalPayments: 1,
            bookedGrowthRate: 50,
          },
        },
      ],
    });
    expect(result.currencies[1].data[1]).toMatchObject({
      bookedRevenue: 150,
      collectedRevenue: 75,
      cumulativeBookedRevenue: 250,
      cumulativeCollectedRevenue: 75,
    });
    expect(repository.revenueTrends).toHaveBeenCalledWith(4, '6 months', 'month');
  });

  it('names open-deal age honestly and separates stage value by currency', async () => {
    repository.pipelineDealAge.mockResolvedValue({
      asOf: new Date('2026-07-20T18:00:00.000Z'),
      data: {
        pipeline: {
          id: 8,
          name: 'Sales',
          stages: [{ id: 'lead', name: 'Lead', color: '#123456' }],
        },
        metrics: {
          won_count: '2',
          lost_count: '1',
          open_count: '3',
          average_days_to_win: '4.6',
          average_days_to_lose: '8.2',
        },
        stageAges: [{
          stage_id: 'lead',
          open_deal_count: '3',
          average_open_deal_age_days: '12.6',
        }],
        stageValues: [
          { stage_id: 'lead', currency: 'EUR', amount: '20' },
          { stage_id: 'lead', currency: 'USD', amount: '100' },
        ],
      },
    });
    await expect(service.pipelineDealAge(4, 8)).resolves.toMatchObject({
      pipeline: { id: 8, name: 'Sales' },
      stages: [{
        stageId: 'lead',
        openDealCount: 3,
        averageOpenDealAgeDays: 13,
        openValueByCurrency: [
          { currency: 'EUR', amount: 20 },
          { currency: 'USD', amount: 100 },
        ],
      }],
      summary: {
        averageDaysToWin: 5,
        averageDaysToLose: 8,
        openDeals: 3,
        wonDeals: 2,
        lostDeals: 1,
        winRate: 67,
      },
    });
    await expect(service.pipelineDealAge(4, 0)).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT', reason: 'INVALID_PIPELINE_ID' },
    });
  });

  it('computes cumulative email rates and outbound-only SMS delivery', async () => {
    repository.communicationStats.mockResolvedValue({
      asOf: new Date('2026-07-20T18:00:00.000Z'),
      data: {
        email: { total: '4', sent: '4', delivered: '3', opened: '2', clicked: '1', bounced: '1', failed: '0' },
        sms: { total: '5', outbound: '4', inbound: '1', sent: '4', delivered: '3', failed: '1', total_segments: '7' },
      },
    });
    await expect(
      service.communicationStats(4, CommunicationAnalyticsPeriod.DAYS_90),
    ).resolves.toMatchObject({
      period: '90days',
      email: { rates: { delivery: 75, open: 67, click: 50 } },
      sms: { rates: { delivery: 75 }, segments: 7 },
    });
    expect(repository.communicationStats).toHaveBeenCalledWith(4, '90 days');
  });

  it('derives workflow summary from authoritative enrollment rows', async () => {
    repository.workflowPerformance.mockResolvedValue({
      asOf: new Date('2026-07-20T18:00:00.000Z'),
      data: [
        { id: 2, name: 'Follow up', trigger_type: 'contact_created', is_active: true, total_enrollments: '3', completed: '2', active: '1', failed: '0', stats: { executions: 999 } },
        { id: 3, name: 'Reminder', trigger_type: 'manual', is_active: false, total_enrollments: '1', completed: '0', active: '0', failed: '1', stats: null },
      ],
    });
    await expect(service.workflowPerformance(4)).resolves.toMatchObject({
      workflows: [
        { id: 2, completionRate: 67, stats: { executions: 999 } },
        { id: 3, completionRate: 0, stats: {} },
      ],
      summary: {
        totalWorkflows: 2, activeWorkflows: 1, totalEnrollments: 4,
        completedEnrollments: 2, activeEnrollments: 1, failedEnrollments: 1,
        overallCompletionRate: 50,
      },
    });
  });

  it('normalizes reputation metrics and validates the bounded day window', async () => {
    repository.reputationAnalytics.mockResolvedValue({
      asOf: new Date('2026-07-20T18:00:00.000Z'),
      data: {
        overall: {
          total_reviews: '3', average_rating: '4.333333', positive_reviews: '2',
          negative_reviews: '1', new_reviews: '1', responded_reviews: '2',
        },
        period: { reviews_count: '2', average_rating: '4.5' },
        ratingDistribution: [{ rating: 5, count: '2' }, { rating: 2, count: '1' }],
        platformDistribution: [{ platform: 'google', count: '3', average_rating: '4.333333' }],
        reviewsOverTime: [{ date: new Date('2026-07-20T00:00:00.000Z'), count: '2', average_rating: '4.5' }],
        requestStats: { total_sent: '4', clicked: '3', converted: '2' },
      },
    });

    await expect(service.reputationAnalytics(4, 90)).resolves.toMatchObject({
      asOf: new Date('2026-07-20T18:00:00.000Z'),
      reportingTimezone: 'UTC',
      overall: { totalReviews: 3, averageRating: 4.333333 },
      period: { days: 90, reviewsCount: 2, averageRating: 4.5 },
      ratingDistribution: [{ rating: 5, count: 2 }, { rating: 2, count: 1 }],
      platformDistribution: [{ platform: 'google', count: 3, averageRating: 4.333333 }],
      reviewsOverTime: [{ date: new Date('2026-07-20T00:00:00.000Z'), count: 2, averageRating: 4.5 }],
      requestStats: { totalSent: 4, clicked: 3, converted: 2 },
    });
    expect(repository.reputationAnalytics).toHaveBeenCalledWith(4, 90);
    await expect(service.reputationAnalytics(4, 0)).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT', reason: 'INVALID_REPUTATION_ANALYTICS_PERIOD' },
    });
  });
});
