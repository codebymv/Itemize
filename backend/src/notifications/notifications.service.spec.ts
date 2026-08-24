import { PoolClient } from 'pg';
import { RealtimeOutboxService } from '../realtime-outbox/realtime-outbox.service';
import { NotificationRow, NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';

const createdAt = new Date('2026-08-24T12:00:00.000Z');
const row: NotificationRow = {
  id: '42',
  event_type: 'estimate.accepted',
  category: 'business',
  priority: 'normal',
  title: 'Estimate accepted',
  body: 'Ada accepted EST-00042 for $125.00.',
  href: '/estimates/42',
  entity_type: 'estimate',
  entity_id: '42',
  payload: { estimateNumber: 'EST-00042' },
  occurred_at: createdAt,
  seen_at: null,
  read_at: null,
  created_at: createdAt,
};

describe('NotificationsService', () => {
  const repository = {
    create: jest.fn(),
    findPage: jest.fn(),
    counts: jest.fn(),
    markSeen: jest.fn(),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
  } as unknown as jest.Mocked<NotificationsRepository>;
  const realtime = {
    enqueue: jest.fn(),
  } as unknown as jest.Mocked<RealtimeOutboxService>;
  const service = new NotificationsService(repository, realtime);

  beforeEach(() => jest.clearAllMocks());

  it('creates a durable notification and transaction-bound realtime projection', async () => {
    repository.create.mockResolvedValue(row);
    realtime.enqueue.mockResolvedValue({ event: {} as never, inserted: true });
    const client = {} as PoolClient;
    await expect(service.createWithClient(client, {
      organizationId: 3,
      recipientUserId: 7,
      eventType: 'estimate.accepted',
      entityType: 'estimate',
      entityId: 42,
      dedupeKey: 'estimate:42:accepted',
      payload: { estimateNumber: 'EST-00042' },
      category: 'business',
      priority: 'normal',
      title: row.title,
      body: row.body,
      href: row.href,
      occurredAt: createdAt,
    })).resolves.toMatchObject({ id: '42', readAt: null });

    expect(realtime.enqueue).toHaveBeenCalledWith(client, expect.objectContaining({
      eventKey: 'notification-created:42',
      aggregateType: 'notification',
      channel: 'user_notification',
      recipientKey: '7',
      eventName: 'notificationCreated',
      payload: expect.objectContaining({ organizationId: 3 }),
    }));
  });

  it('returns a cursor page and current recipient counts', async () => {
    repository.findPage.mockResolvedValue([row, { ...row, id: '41' }]);
    repository.counts.mockResolvedValue({ unread: 2, unseen: 1 });
    const result = await service.list({
      organizationId: 3,
      userId: 7,
      first: 1,
    });
    expect(result.nodes).toHaveLength(1);
    expect(result.pageInfo).toMatchObject({ hasNextPage: true });
    expect(result.pageInfo.endCursor).toEqual(expect.any(String));
    expect(result).toMatchObject({ unreadCount: 2, unseenCount: 1 });
  });

  it('rejects malformed cursors before querying', async () => {
    await expect(service.list({
      organizationId: 3,
      userId: 7,
      after: 'not-a-cursor',
    })).rejects.toMatchObject({ extensions: expect.objectContaining({ code: 'BAD_USER_INPUT' }) });
    expect(repository.findPage).not.toHaveBeenCalled();
  });

  it('does not expose another tenant notification as a successful read', async () => {
    repository.markRead.mockResolvedValue(false);
    await expect(service.markRead(3, 7, '42'))
      .rejects.toMatchObject({ extensions: expect.objectContaining({ code: 'NOT_FOUND' }) });
  });
});
