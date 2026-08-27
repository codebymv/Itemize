import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { AccountDeletionRepository } from './account-deletion.repository';
import { AuthEmailService } from './auth-email.service';

@Injectable()
export class AccountDeletionSchedulerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(AccountDeletionSchedulerService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly deletions: AccountDeletionRepository,
    private readonly emails: AuthEmailService,
  ) {}

  onApplicationBootstrap(): void {
    const intervalMs = 60_000;
    this.logger.log(`Account deletion worker checks expired recovery windows every ${intervalMs}ms`);
    void this.runCycle();
    this.timer = setInterval(() => void this.runCycle(), intervalMs);
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runCycle(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const results = await this.deletions.purgeDue(25);
      for (const result of results) {
        if (result.kind === 'deleted') {
          await this.emails.sendAccountDeleted(result.user);
        } else {
          await this.emails.sendAccountDeletionCanceled(result.user);
        }
      }
      return results.length;
    } catch (error) {
      this.logger.error(
        `Account deletion cycle failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return 0;
    } finally {
      this.running = false;
    }
  }
}
