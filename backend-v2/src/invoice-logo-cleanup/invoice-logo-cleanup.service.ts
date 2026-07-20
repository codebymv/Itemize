import { Inject, Injectable } from '@nestjs/common';
import {
  INVOICE_LOGO_STORAGE,
  InvoiceLogoStorage,
} from './invoice-logo-storage.provider';
import { InvoiceLogoCleanupRepository } from './invoice-logo-cleanup.repository';

@Injectable()
export class InvoiceLogoCleanupService {
  constructor(
    private readonly jobs: InvoiceLogoCleanupRepository,
    @Inject(INVOICE_LOGO_STORAGE) private readonly storage: InvoiceLogoStorage,
  ) {}

  async runDue(limit = 25): Promise<{ attempted: number; deleted: number }> {
    const due = await this.jobs.dueIds(Math.max(1, Math.min(limit, 100)));
    let deleted = 0;
    for (const job of due) {
      const claimed = await this.jobs.claim(job.organizationId, job.id);
      if (!claimed) continue;
      try {
        if (await this.jobs.isReferenced(
          claimed.organization_id,
          claimed.logo_url,
        )) {
          await this.jobs.complete(job.organizationId, job.id);
          continue;
        }
        const result = await this.storage.remove(claimed.logo_url);
        if (result.kind === 'rejected') {
          await this.jobs.fail(
            job.organizationId, job.id, result.message, false,
          );
          continue;
        }
        await this.jobs.complete(job.organizationId, job.id);
        deleted += 1;
      } catch (error) {
        await this.jobs.fail(
          job.organizationId, job.id, this.error(error), true,
        );
      }
    }
    return { attempted: due.length, deleted };
  }

  private error(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown logo storage failure';
  }
}
