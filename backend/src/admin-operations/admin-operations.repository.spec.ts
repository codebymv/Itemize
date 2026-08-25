import { Pool, PoolClient } from 'pg';
import { NotificationsService } from '../notifications/notifications.service';
import { AdminOperationsRepository } from './admin-operations.repository';

describe('AdminOperationsRepository plan notifications', () => {
  it('records and notifies an effective tier change atomically', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ default_organization_id: 3 }] })
      .mockResolvedValueOnce({ rows: [{ current_plan_id: 2, plan: 'starter' }] })
      .mockResolvedValueOnce({ rows: [{ id: 3 }] })
      .mockResolvedValueOnce({ rows: [{ id: 9 }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: '17' }] })
      .mockResolvedValueOnce({ rows: [] });
    const client = { query, release: jest.fn() } as unknown as PoolClient;
    const pool = { connect: jest.fn().mockResolvedValue(client) } as unknown as Pool;
    const notifications = {
      createForOrganizationOwnerWithClient: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<NotificationsService>;
    const repository = new AdminOperationsRepository(pool, notifications);

    await expect(repository.updateOwnPlan(7, 'unlimited', {
      status: 'active',
      limits: {
        emails: 10_000,
        sms: 5_000,
        apiCalls: 10_000,
        contacts: 25_000,
        users: 10,
        workflows: 25,
        landingPages: 50,
        forms: 50,
        calendars: -1,
      },
    })).resolves.toBe('updated');

    expect(notifications.createForOrganizationOwnerWithClient).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        organizationId: 3,
        preferredUserId: 7,
        eventType: 'subscription.plan_changed',
        dedupeKey: 'subscription-event:17:plan-changed',
        title: 'Plan changed to Studio',
        body: 'Your Itemize plan changed from Solo to Studio.',
      }),
    );
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
  });
});
