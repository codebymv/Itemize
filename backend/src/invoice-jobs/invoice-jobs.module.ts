import { Module } from '@nestjs/common';
import { InvoiceJobsService } from './invoice-jobs.service';
import { InvoiceJobsSchedulerService } from './invoice-jobs-scheduler.service';

@Module({
  providers: [InvoiceJobsService, InvoiceJobsSchedulerService],
})
export class InvoiceJobsModule {}
