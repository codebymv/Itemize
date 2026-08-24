import { Module } from '@nestjs/common';
import { RecurringInvoicesRepository } from './recurring-invoices.repository';
import { RecurringInvoicesResolver } from './recurring-invoices.resolver';
import { RecurringInvoicesService } from './recurring-invoices.service';

@Module({
  providers: [
    RecurringInvoicesRepository,
    RecurringInvoicesService,
    RecurringInvoicesResolver,
  ],
  exports: [RecurringInvoicesService],
})
export class RecurringInvoicesModule {}
