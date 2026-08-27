import { AccountDeletionSchedulerService } from './account-deletion-scheduler.service';

describe('AccountDeletionSchedulerService', () => {
  it('sends completion and blocker-cancellation messages for processed accounts', async () => {
    const deletions = {
      purgeDue: jest.fn().mockResolvedValue([
        { kind: 'deleted', user: { id: 1, email: 'one@example.com', name: 'One' } },
        {
          kind: 'canceled',
          user: { id: 2, email: 'two@example.com', name: 'Two' },
          blockers: [],
        },
      ]),
    };
    const emails = {
      sendAccountDeleted: jest.fn().mockResolvedValue(true),
      sendAccountDeletionCanceled: jest.fn().mockResolvedValue(true),
    };
    const scheduler = new AccountDeletionSchedulerService(
      deletions as never,
      emails as never,
    );

    await expect(scheduler.runCycle()).resolves.toBe(2);
    expect(emails.sendAccountDeleted).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'one@example.com' }),
    );
    expect(emails.sendAccountDeletionCanceled).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'two@example.com' }),
    );
  });
});
