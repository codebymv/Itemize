import { AnalyticsRepository, DashboardSnapshotRows } from './analytics.repository';
import { AnalyticsService } from './analytics.service';

const snapshot = (extra: Partial<DashboardSnapshotRows> = {}): DashboardSnapshotRows => ({
  asOf: new Date('2026-07-20T18:00:00.000Z'),
  contacts: {
    total: '2', active: '1', leads: '0', customers: '0',
    new_this_month: '1', new_this_week: '1',
  },
  contactGrowth: [{ month: new Date('2026-07-01T00:00:00.000Z'), count: '1' }],
  deals: {
    total: '3', open: '2', won: '1', lost: '0', open_value: '1024.50',
    booked_value: '100.25', booked_this_month: '100.25',
  },
  dealsByStage: [
    {
      stage_id: 'proposal',
      stages: [
        { id: 'qualified', name: 'Qualified', color: '#112233' },
        { id: 'proposal', name: 'Proposal', color: '#445566' },
      ],
      count: '2', total_value: '1024.50',
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
  payments: { collected_value: '50.75', collected_this_month: '50.75' },
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
    repository = { dashboardSnapshot: jest.fn() } as unknown as jest.Mocked<AnalyticsRepository>;
    service = new AnalyticsService(repository);
  });

  it('normalizes PostgreSQL numerics and keeps booked and collected values separate', async () => {
    repository.dashboardSnapshot.mockResolvedValue(snapshot());
    await expect(service.dashboard(4)).resolves.toMatchObject({
      asOf: new Date('2026-07-20T18:00:00.000Z'),
      reportingTimezone: 'UTC',
      contacts: { total: 2, active: 1 },
      deals: {
        openValue: 1024.5,
        wonValue: 151,
        bookedValue: 100.25,
        collectedValue: 50.75,
      },
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
        dealCount: 0, totalValue: 0,
      },
      {
        stageId: 'proposal', stageName: 'Proposal', stageColor: '#445566',
        dealCount: 2, totalValue: 1024.5,
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
});
