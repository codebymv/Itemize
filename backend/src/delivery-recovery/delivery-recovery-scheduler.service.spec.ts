import { Logger } from '@nestjs/common';
import { DeliveryRecoverySchedulerService } from './delivery-recovery-scheduler.service';
import { CampaignSendService } from '../campaign-delivery/campaign-send.service';
import { CampaignTestEmailService } from '../campaign-delivery/campaign-test-email.service';
import { InvoiceEmailDeliveryService } from '../invoices/invoice-email-delivery.service';
import { InvoiceLogoCleanupService } from '../invoice-logo-cleanup/invoice-logo-cleanup.service';

describe('DeliveryRecoverySchedulerService', () => {
  const env = process.env;
  const flags = ['CAMPAIGN_DELIVERY_SCHEDULER_ENABLED', 'CAMPAIGN_TEST_EMAIL_RECOVERY_ENABLED',
    'INVOICE_EMAIL_RECOVERY_ENABLED', 'INVOICE_LOGO_CLEANUP_SCHEDULER_ENABLED'];
  let service: DeliveryRecoverySchedulerService;
  let jobs: Array<{ runDue: jest.Mock; runScheduled: jest.Mock }>;
  beforeEach(() => {
    jest.useFakeTimers();
    process.env = { ...env };
    flags.forEach(flag => delete process.env[flag]);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jobs = flags.map(() => ({ runDue: jest.fn().mockResolvedValue({ attempted: 0 }), runScheduled: jest.fn().mockResolvedValue({ scheduled: 0, blocked: 0 }) }));
    service = new DeliveryRecoverySchedulerService(
      jobs[0] as unknown as CampaignSendService, jobs[1] as unknown as CampaignTestEmailService,
      jobs[2] as unknown as InvoiceEmailDeliveryService, jobs[3] as unknown as InvoiceLogoCleanupService,
    );
  });
  afterEach(async () => {
    await service.beforeApplicationShutdown();
    process.env = env;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  it('does not process queues without explicit ownership', async () => {
    service.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(3_600_000);
    jobs.forEach(job => expect(job.runDue).not.toHaveBeenCalled());
  });
  it('runs enabled jobs at their own cadence and stops after shutdown', async () => {
    flags.forEach(flag => process.env[flag] = 'true');
    service.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(60_000);
    jobs.slice(0, 3).forEach(job => expect(job.runDue).toHaveBeenCalledTimes(2));
    expect(jobs[3].runDue).toHaveBeenCalledTimes(1);
    await service.beforeApplicationShutdown();
    await jest.advanceTimersByTimeAsync(3_600_000);
    expect(jobs[0].runDue).toHaveBeenCalledTimes(2);
    expect(jobs[3].runDue).toHaveBeenCalledTimes(1);
  });
  it('prevents overlap, isolates failures, and drains active work before shutdown', async () => {
    flags.slice(0, 3).forEach(flag => process.env[flag] = 'true');
    let finish!: () => void;
    jobs[0].runDue.mockImplementation(() => new Promise<void>(resolve => finish = resolve));
    jobs[1].runDue.mockRejectedValue(new Error('sensitive provider failure'));
    service.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(120_000);
    expect(jobs[0].runDue).toHaveBeenCalledTimes(1);
    expect(jobs[1].runDue).toHaveBeenCalledTimes(3);
    expect(jobs[2].runDue).toHaveBeenCalledTimes(3);
    expect(Logger.prototype.error).not.toHaveBeenCalledWith(expect.stringContaining('sensitive'));
    let stopped = false;
    const shutdown = service.beforeApplicationShutdown().then(() => { stopped = true; });
    await Promise.resolve();
    expect(stopped).toBe(false);
    finish();
    await shutdown;
    expect(stopped).toBe(true);
  });
});
