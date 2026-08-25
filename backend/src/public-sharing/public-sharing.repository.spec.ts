import { Pool, PoolClient } from 'pg';
import { NotificationsService } from '../notifications/notifications.service';
import { PublicSharingRepository } from './public-sharing.repository';

describe('PublicSharingRepository view notifications', () => {
  const occurredAt = new Date('2026-08-25T20:00:00.000Z');

  it('records an external view transaction with a time-bucketed dedupe key', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const client = { query, release: jest.fn() } as unknown as PoolClient;
    const pool = { connect: jest.fn().mockResolvedValue(client) } as unknown as Pool;
    const notifications = {
      createWithClient: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<NotificationsService>;
    const repository = new PublicSharingRepository(pool, notifications);

    await repository.recordSharedView({
      kind: 'note',
      id: 9,
      title: 'Launch notes',
      organizationId: 4,
      ownerUserId: 7,
      viewerUserId: null,
      occurredAt,
    });

    expect(query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'COMMIT']);
    expect(notifications.createWithClient).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        organizationId: 4,
        recipientUserId: 7,
        actorUserId: null,
        eventType: 'workspace.note.viewed',
        dedupeKey: `workspace-share:note:9:viewed:${Math.floor(occurredAt.getTime() / 900_000)}`,
        title: 'Note viewed',
        body: 'Someone viewed “Launch notes”.',
        href: '/contents',
      }),
    );
    expect(client.release).toHaveBeenCalled();
  });

  it('does no database work for the content owner', async () => {
    const pool = { connect: jest.fn() } as unknown as Pool;
    const notifications = {
      createWithClient: jest.fn(),
    } as unknown as jest.Mocked<NotificationsService>;
    const repository = new PublicSharingRepository(pool, notifications);

    await repository.recordSharedView({
      kind: 'list',
      id: 11,
      title: 'Private preview',
      organizationId: 4,
      ownerUserId: 7,
      viewerUserId: 7,
      occurredAt,
    });

    expect(pool.connect).not.toHaveBeenCalled();
    expect(notifications.createWithClient).not.toHaveBeenCalled();
  });
});
