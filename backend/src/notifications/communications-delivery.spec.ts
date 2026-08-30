import { EmailWebhooksService } from '../email-webhooks/email-webhooks.service';
import { SmsWebhooksService } from '../sms-webhooks/sms-webhooks.service';
import { NotificationsService } from './notifications.service';

const deliveryRow = {
  id: 41,
  organization_id: 13,
  requested_by_user_id: 7,
  conversation_id: 22,
  message_id: 31,
  channel: 'email',
  first_name: 'Maya',
  last_name: 'Patel',
  email: 'maya@example.test',
  phone: '+16025550121',
};

const notificationMock = () => ({
  createForOrganizationOwnerWithClient: jest.fn().mockResolvedValue(null),
}) as unknown as jest.Mocked<NotificationsService>;

describe('provider delivery notification synchronization', () => {
  it('turns an accepted email bounce into one actionable Inbox notification', async () => {
    const notifications = notificationMock();
    const service = new EmailWebhooksService({} as never, notifications);
    const client = {
      query: jest.fn(async (sql: string) => (
        sql.includes('FROM message_delivery_jobs')
          ? { rows: [deliveryRow] }
          : { rows: [], rowCount: 1 }
      )),
    };

    await (service as unknown as {
      syncDirectDelivery(client: unknown, target: unknown, event: unknown): Promise<void>;
    }).syncDirectDelivery(
      client,
      {
        organization_id: 13,
        metadata: { message_delivery_job_id: 41 },
      },
      {
        eventType: 'email.bounced',
        eventCreatedAt: new Date('2026-08-29T18:00:00.000Z'),
        details: { message: 'Mailbox unavailable' },
      },
    );

    expect(notifications.createForOrganizationOwnerWithClient).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        dedupeKey: 'communication:delivery:41:attention',
        title: 'Email delivery failed',
        href: '/inbox?conversation=22',
      }),
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE messages'),
      expect.arrayContaining([13, 31, expect.stringContaining('"delivery_status":"failed"')]),
    );
  });

  it('turns an accepted SMS failure into the same deduplicated alert shape', async () => {
    const notifications = notificationMock();
    const service = new SmsWebhooksService({} as never, notifications);
    const client = {
      query: jest.fn(async (sql: string) => (
        sql.includes('FROM message_delivery_jobs')
          ? { rows: [{ ...deliveryRow, channel: 'sms' }] }
          : { rows: [], rowCount: 1 }
      )),
    };

    await (service as unknown as {
      syncOutboundDelivery(client: unknown, log: unknown, values: unknown): Promise<void>;
    }).syncOutboundDelivery(
      client,
      { organization_id: 13, metadata: { message_delivery_job_id: 41 } },
      {
        messageSid: 'SM123',
        dbStatus: 'undelivered',
        errorCode: '30003',
        errorMessage: 'Unreachable destination',
        providerStatus: 'undelivered',
      },
    );

    expect(notifications.createForOrganizationOwnerWithClient).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        dedupeKey: 'communication:delivery:41:attention',
        title: 'SMS delivery failed',
        href: '/inbox?conversation=22',
      }),
    );
  });
});
