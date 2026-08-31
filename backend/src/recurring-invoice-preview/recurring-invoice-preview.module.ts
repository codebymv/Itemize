import { Module } from '@nestjs/common';
import { InvoiceBusinessesModule } from '../invoice-businesses/invoice-businesses.module';
import { RecurringInvoicesModule } from '../recurring-invoices/recurring-invoices.module';
import { RecurringInvoicePreviewResolver } from './recurring-invoice-preview.resolver';
import { RecurringInvoicePreviewService } from './recurring-invoice-preview.service';

@Module({
  imports: [RecurringInvoicesModule, InvoiceBusinessesModule],
  providers: [
    RecurringInvoicePreviewService,
    RecurringInvoicePreviewResolver,
  ],
})
export class RecurringInvoicePreviewModule {}
