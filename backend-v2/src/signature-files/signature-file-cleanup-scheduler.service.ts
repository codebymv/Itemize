/**
 * NestJS replacement for the legacy 15-minute signature file cleanup
 * cron (backend/src/jobs/signature-worker-scheduler.js). Default-off
 * behind SIGNATURE_FILE_CLEANUP_NEST_ENABLED; the legacy scheduler's
 * own opt-in flag (SIGNATURE_FILE_CLEANUP_ENABLED) stays authoritative
 * until cutover; claim fencing makes overlap safe.
 */
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { SignatureFileCleanupService } from './signature-file-cleanup.service';
import {
  booleanEnvironmentValue,
  integerEnvironmentValue,
} from '../common/runtime-config';

@Injectable()
export class SignatureFileCleanupSchedulerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(
    SignatureFileCleanupSchedulerService.name,
  );
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly cleanup: SignatureFileCleanupService) {}

  onApplicationBootstrap(): void {
    if (
      !booleanEnvironmentValue(
        process.env,
        'SIGNATURE_FILE_CLEANUP_NEST_ENABLED',
      )
    ) {
      return;
    }
    const intervalMs = integerEnvironmentValue(
      process.env,
      'SIGNATURE_FILE_CLEANUP_NEST_INTERVAL_MS',
      900_000,
      1_000,
      3_600_000,
    );
    this.logger.log(
      `NestJS signature file cleanup runs every ${intervalMs}ms`,
    );
    void this.tick();
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (this.running) {
      this.logger.warn('Skipping overlapping signature file cleanup cycle');
      return;
    }
    this.running = true;
    try {
      const summary = await this.cleanup.run({
        limit: process.env.SIGNATURE_FILE_CLEANUP_BATCH_SIZE,
        leaseSeconds: process.env.SIGNATURE_FILE_CLEANUP_LEASE_SECONDS,
        maxAttempts: process.env.SIGNATURE_FILE_CLEANUP_MAX_ATTEMPTS,
      });
      if (summary.claimed > 0) {
        this.logger.log(
          `Signature file cleanup cycle completed ${JSON.stringify(summary)}`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Signature file cleanup cycle failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }
}
