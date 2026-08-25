import { Pool, PoolClient } from 'pg';
import { NotificationsService } from '../notifications/notifications.service';
import {
  EstimatePublicRepository,
  PublicEstimateCapability,
} from './estimate-public.repository';

const viewedAt = new Date('2026-08-24T18:30:00.000Z');
const capability: PublicEstimateCapability = {
  capability_id: 19,
  delivery_id: 23,
  organization_id: 3,
  estimate_id: 42,
  estimate_created_by: 7,
  requested_by_user_id: 7,
  estimate_number: 'EST-00042',
  organization_name: 'Ada Studio',
  status: 'sent',
  sent_at: new Date('2026-08-24T18:00:00.000Z'),
  viewed_at: null,
  accepted_at: null,
  declined_at: null,
  expires_at: new Date('2026-09-24T18:00:00.000Z'),
  payload: {
    subject: 'Your estimate',
    estimateNumber: 'EST-00042',
    customerName: 'Grace Hopper',
    issueDate: '2026-08-24',
    total: '125.00',
    subtotal: '125.00',
    taxAmount: '0.00',
    discountAmount: '0.00',
    currency: 'USD',
    validUntil: '2026-09-24',
    businessName: 'Ada Studio',
    businessEmail: 'ada@example.com',
    notes: null,
    termsAndConditions: null,
    items: [],
  },
};

describe('EstimatePublicRepository first-view notifications', () => {
  it('creates exactly one notification when the first view is persisted', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...capability }] })
      .mockResolvedValueOnce({ rows: [{ viewed_at: viewedAt }] })
      .mockResolvedValueOnce({ rows: [{ id: 7, email: 'ada@example.com', name: 'Ada' }] })
      .mockResolvedValueOnce({ rows: [] });
    const client = { query, release: jest.fn() } as unknown as PoolClient;
    const pool = { connect: jest.fn().mockResolvedValue(client) } as unknown as Pool;
    const notifications = {
      createWithClient: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<NotificationsService>;
    const repository = new EstimatePublicRepository(pool, notifications);

    await expect(repository.open('token-hash')).resolves.toMatchObject({
      viewed_at: viewedAt,
    });
    expect(notifications.createWithClient).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        eventType: 'estimate.viewed',
        dedupeKey: 'estimate:42:viewed',
        recipientUserId: 7,
        occurredAt: viewedAt,
      }),
    );
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
  });

  it('does not notify again when the estimate was already viewed', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...capability, viewed_at: viewedAt }] })
      .mockResolvedValueOnce({ rows: [] });
    const client = { query, release: jest.fn() } as unknown as PoolClient;
    const pool = { connect: jest.fn().mockResolvedValue(client) } as unknown as Pool;
    const notifications = {
      createWithClient: jest.fn(),
    } as unknown as jest.Mocked<NotificationsService>;

    await new EstimatePublicRepository(pool, notifications).open('token-hash');

    expect(notifications.createWithClient).not.toHaveBeenCalled();
  });
});
