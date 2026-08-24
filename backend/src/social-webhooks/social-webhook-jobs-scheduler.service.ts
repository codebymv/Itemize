/**
 * NestJS replacement for the legacy per-minute social webhook cron
 * (backend/src/scheduler.js): processing and reconciliation queues run
 * together each tick. The post-commit agent notification goes to the
 * org-social room through the NestJS realtime host, and — like the
 * legacy scheduler's `io ? onProcessed : null` — is skipped entirely
 * when this process is not the socket origin. Default-off behind
 * SOCIAL_WEBHOOK_NEST_JOBS_ENABLED; at cutover enable it in the
 * runtime where REALTIME_HOST_NESTJS_ENABLED is on so agent
 * notifications keep flowing.
 */
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { RealtimeHostService } from '../realtime-host/realtime-host.service';
import {
  boundedInteger,
  SocialWebhookJobsService,
} from './social-webhook-jobs.service';
import { SocialWebhookProcessResult } from './social-webhook-processing.service';

@Injectable()
export class SocialWebhookJobsSchedulerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(SocialWebhookJobsSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly jobs: SocialWebhookJobsService,
    private readonly realtimeHost: RealtimeHostService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.SOCIAL_WEBHOOK_NEST_JOBS_ENABLED !== 'true') return;

    const intervalMs = boundedInteger(
      process.env.SOCIAL_WEBHOOK_NEST_JOBS_INTERVAL_MS,
      60_000,
      1_000,
      3_600_000,
    );
    this.logger.log(`NestJS social webhook workers run every ${intervalMs}ms`);
    void this.tick();
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * The post-commit agent notification used by each cycle: emit the
   * processed message into the org-social room, or nothing at all when
   * this process does not host the socket server (the legacy
   * scheduler's `io ? onProcessed : null`).
   */
  agentNotificationHook():
    | ((result: SocialWebhookProcessResult) => Promise<void>)
    | null {
    if (!this.realtimeHost.isAttached()) return null;
    return async (result: SocialWebhookProcessResult) => {
      this.realtimeHost.emitToOrgSocial(
        result.channel!.organization_id,
        'social_message',
        {
          conversation_id: result.conversationId,
          message: result.message,
          is_new_conversation: result.isNewConversation,
        },
      );
    };
  }

  private async tick(): Promise<void> {
    if (this.running) {
      this.logger.warn('Skipping overlapping social webhook job cycle');
      return;
    }
    this.running = true;
    const onProcessed = this.agentNotificationHook();
    try {
      const [processingSummary, reconciliationSummary] = await Promise.all([
        this.jobs.runProcessing({ onProcessed }),
        this.jobs.runReconciliation({ onProcessed }),
      ]);
      if (processingSummary.claimed > 0) {
        this.logger.log(
          `Social webhook processing jobs completed ${JSON.stringify(processingSummary)}`,
        );
      }
      if (reconciliationSummary.claimed > 0) {
        this.logger.log(
          `Social webhook reconciliation jobs completed ${JSON.stringify(reconciliationSummary)}`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Social webhook job cycle failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }
}
