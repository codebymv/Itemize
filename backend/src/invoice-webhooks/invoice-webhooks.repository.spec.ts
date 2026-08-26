import { NotificationsService } from '../notifications/notifications.service';
import { InvoiceWebhooksRepository } from './invoice-webhooks.repository';

describe('InvoiceWebhooksRepository connected-account events', () => {
  const query = jest.fn();
  const release = jest.fn();
  const connect = jest.fn().mockResolvedValue({ query, release });
  const notifications = {
    createWithClient: jest.fn(),
  } as unknown as NotificationsService;
  const repository = new InvoiceWebhooksRepository(
    { connect } as never,
    notifications,
  );

  beforeEach(() => {
    query.mockReset();
    release.mockReset();
    connect.mockClear();
  });

  it.each([
    ['account.updated', true],
    ['account.application.deauthorized', false],
  ])('synchronizes %s readiness by the stored Stripe account', async (type, connected) => {
    query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ event_id: 'evt_account' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({});

    await expect(repository.process({
      id: 'evt_account',
      type,
      session: null,
      connectedAccount: {
        stripeAccountId: 'acct_Merchant123',
        connected,
      },
    })).resolves.toEqual({
      received: true,
      duplicateEvent: false,
      handled: true,
    });

    expect(query.mock.calls[2][0]).toContain('WHERE stripe_account_id = $1');
    expect(query.mock.calls[2][1]).toEqual(['acct_Merchant123', connected]);
    expect(query.mock.calls[3][0]).toBe('COMMIT');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('acknowledges an account event that is not owned by Itemize', async () => {
    query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ event_id: 'evt_unknown' }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({});

    await expect(repository.process({
      id: 'evt_unknown',
      type: 'account.updated',
      session: null,
      connectedAccount: {
        stripeAccountId: 'acct_Unknown123',
        connected: true,
      },
    })).resolves.toEqual({
      received: true,
      duplicateEvent: false,
      handled: false,
      reason: 'connected_account_not_found',
    });
  });
});
