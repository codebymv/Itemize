import { EmailWebhookJobsSchedulerService } from './email-webhook-jobs-scheduler.service';
import { EmailWebhookJobsService } from './email-webhook-jobs.service';

describe('email webhook startup recovery', () => {
  const previousFlag = process.env.EMAIL_WEBHOOK_NEST_JOBS_ENABLED;
  beforeEach(() => { jest.useFakeTimers(); process.env.EMAIL_WEBHOOK_NEST_JOBS_ENABLED = 'true'; });
  afterEach(() => {
    jest.useRealTimers();
    if (previousFlag === undefined) delete process.env.EMAIL_WEBHOOK_NEST_JOBS_ENABLED;
    else process.env.EMAIL_WEBHOOK_NEST_JOBS_ENABLED = previousFlag;
  });

  it('recovers once before draining, without resetting backoff every cycle', async () => {
    const jobs = { recoverKnownReceipts: jest.fn().mockResolvedValue(2),
      run: jest.fn().mockResolvedValue({ claimed: 0 }) };
    const scheduler = new EmailWebhookJobsSchedulerService(jobs as unknown as EmailWebhookJobsService);
    scheduler.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(120000);
    expect(jobs.recoverKnownReceipts).toHaveBeenCalledTimes(1);
    expect(jobs.run).toHaveBeenCalledTimes(3);
    expect(jobs.recoverKnownReceipts.mock.invocationCallOrder[0]).toBeLessThan(jobs.run.mock.invocationCallOrder[0]);
    scheduler.onApplicationShutdown();
  });

  it('retries failed startup recovery on the next cycle', async () => {
    const jobs = { recoverKnownReceipts: jest.fn().mockRejectedValueOnce(new Error('database unavailable')).mockResolvedValue(0),
      run: jest.fn().mockResolvedValue({ claimed: 0 }) };
    const scheduler = new EmailWebhookJobsSchedulerService(jobs as unknown as EmailWebhookJobsService);
    scheduler.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(60000);
    expect(jobs.recoverKnownReceipts).toHaveBeenCalledTimes(2);
    expect(jobs.run).toHaveBeenCalledTimes(1);
    scheduler.onApplicationShutdown();
  });
});
