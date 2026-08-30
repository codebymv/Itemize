import { MessageDeliveryRepository, MessageDeliveryJobRow } from './message-delivery.repository';
import { NotificationsService } from '../notifications/notifications.service';

describe('MessageDeliveryRepository notifications', () => {
  it('creates one actionable notification for a terminal contact delivery failure', async () => {
    const job: MessageDeliveryJobRow = {
      id: 41,
      organization_id: 13,
      requested_by_user_id: 7,
      idempotency_key: 'delivery-key',
      request_fingerprint: 'fingerprint',
      kind: 'contact_email',
      channel: 'email',
      contact_id: 9,
      email_template_id: null,
      sms_template_id: null,
      conversation_id: 22,
      message_id: 31,
      payload: { to: 'maya@example.test', from: 'team@example.test', subject: 'Hello' },
      status: 'processing',
      attempt_count: 5,
      provider_id: null,
      last_error: null,
      created_at: new Date('2026-08-29T12:00:00.000Z'),
    };
    const client = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM message_delivery_jobs') && sql.includes('FOR UPDATE')) {
          return { rows: [job] };
        }
        if (sql.includes('UPDATE message_delivery_jobs')) {
          return { rows: [{ ...job, status: 'dead_letter', last_error: 'Rejected' }] };
        }
        if (sql.includes('SELECT first_name,last_name,email,phone')) {
          return { rows: [{ first_name: 'Maya', last_name: 'Patel', email: null, phone: null }] };
        }
        return { rows: [], rowCount: 1 };
      }),
      release: jest.fn(),
    };
    const pool = { connect: jest.fn().mockResolvedValue(client) };
    const notifications = {
      createForOrganizationOwnerWithClient: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<NotificationsService>;
    const repository = new MessageDeliveryRepository(pool as never, notifications);

    const result = await repository.fail(13, 41, 'Rejected', true);

    expect(result.status).toBe('dead_letter');
    expect(notifications.createForOrganizationOwnerWithClient).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        eventType: 'communication.delivery_failed',
        dedupeKey: 'communication:delivery:41:attention',
        title: 'Email delivery failed',
        body: 'Your message to Maya Patel could not be delivered.',
        href: '/inbox?conversation=22',
      }),
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });
});
