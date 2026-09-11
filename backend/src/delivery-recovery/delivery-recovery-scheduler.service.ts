import { Injectable, Logger, OnApplicationBootstrap, BeforeApplicationShutdown } from '@nestjs/common';
import { CampaignSendService } from '../campaign-delivery/campaign-send.service';
import { CampaignTestEmailService } from '../campaign-delivery/campaign-test-email.service';
import { InvoiceEmailDeliveryService } from '../invoices/invoice-email-delivery.service';
import { InvoiceLogoCleanupService } from '../invoice-logo-cleanup/invoice-logo-cleanup.service';

type Job = { flag: string; interval: number; run: () => Promise<unknown> };

/** Cadence only: existing delivery services retain queue claims and provider idempotency. */
@Injectable()
export class DeliveryRecoverySchedulerService implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(DeliveryRecoverySchedulerService.name);
  private readonly timers: NodeJS.Timeout[] = [];
  private readonly active = new Map<string, Promise<void>>();
  private stopping = false;

  constructor(
    private readonly campaigns: CampaignSendService,
    private readonly testEmails: CampaignTestEmailService,
    private readonly invoices: InvoiceEmailDeliveryService,
    private readonly logos: InvoiceLogoCleanupService,
  ) {}

  onApplicationBootstrap(): void {
    const jobs: Job[] = [
      { flag: 'CAMPAIGN_DELIVERY_SCHEDULER_ENABLED', interval: 60_000, run: async () => {
        const scheduling = await this.campaigns.runScheduled(25);
        const delivery = await this.campaigns.runDue(100);
        return { ...scheduling, ...delivery };
      } },
      { flag: 'CAMPAIGN_TEST_EMAIL_RECOVERY_ENABLED', interval: 60_000, run: () => this.testEmails.runDue(25) },
      { flag: 'INVOICE_EMAIL_RECOVERY_ENABLED', interval: 60_000, run: () => this.invoices.runDue(25) },
      { flag: 'INVOICE_LOGO_CLEANUP_SCHEDULER_ENABLED', interval: 3_600_000, run: () => this.logos.runDue(25) },
    ];
    for (const job of jobs) {
      if (process.env[job.flag] !== 'true') continue;
      this.logger.log(`${job.flag} runs every ${job.interval}ms`);
      this.tick(job);
      const timer = setInterval(() => this.tick(job), job.interval);
      timer.unref();
      this.timers.push(timer);
    }
  }

  private tick(job: Job): void {
    if (this.stopping || this.active.has(job.flag)) return;
    const pending = Promise.resolve().then(job.run).then((result) => {
      if (Object.values(result as Record<string, unknown>).some(value => typeof value === 'number' && value > 0)) {
        this.logger.log(`${job.flag}: ${JSON.stringify(result)}`);
      }
    }).catch(() => {
      // Provider errors can contain tokens or recipient data; queue rows retain diagnostics.
      this.logger.error(`${job.flag} cycle failed; inspect queue status`);
    }).finally(() => this.active.delete(job.flag));
    this.active.set(job.flag, pending);
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.stopping = true;
    for (const timer of this.timers) clearInterval(timer);
    this.timers.length = 0;
    await Promise.all(this.active.values());
  }
}
