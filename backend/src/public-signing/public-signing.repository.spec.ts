import { Pool, PoolClient } from 'pg';
import { NotificationsService } from '../notifications/notifications.service';
import { PublicSigningRepository } from './public-signing.repository';

describe('PublicSigningRepository first-view notifications', () => {
  it('notifies the sender only when the recipient view is first persisted', async () => {
    const viewedAt = new Date('2026-08-24T19:00:00.000Z');
    const capability = {
      recipient_id: 11,
      recipient_name: 'Grace Hopper',
      recipient_email: 'grace@example.com',
      recipient_status: 'sent',
      routing_status: 'active',
      signing_order: 1,
      identity_method: 'none',
      identity_verified_at: null,
      document_id: 52,
      organization_id: 3,
      title: 'Consulting agreement',
      description: null,
      message: null,
      file_url: '/document.pdf',
      file_name: 'document.pdf',
      file_type: 'application/pdf',
      original_sha256: null,
      document_status: 'sent',
      expires_at: null,
      routing_mode: 'parallel',
      sender_name: 'Ada',
      sender_email: 'ada@example.com',
      created_by: 7,
    };
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [capability] })
      .mockResolvedValueOnce({ rows: [{ id: 11, viewed_at: viewedAt }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ user_id: 7 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const client = { query, release: jest.fn() } as unknown as PoolClient;
    const pool = { connect: jest.fn().mockResolvedValue(client) } as unknown as Pool;
    const notifications = {
      createWithClient: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<NotificationsService>;
    const repository = new PublicSigningRepository(pool, notifications);

    await expect(repository.openSession('token-hash', {
      ipAddress: '203.0.113.4',
      userAgent: 'test',
      requestId: 'request-1',
    })).resolves.toMatchObject({ capability: { recipient_status: 'viewed' } });

    expect(notifications.createWithClient).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        eventType: 'signature.viewed',
        dedupeKey: 'signature:52:recipient:11:viewed',
        recipientUserId: 7,
        occurredAt: viewedAt,
      }),
    );
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
  });
});
