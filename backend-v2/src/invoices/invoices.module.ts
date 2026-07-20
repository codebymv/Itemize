import { Module } from '@nestjs/common';
import { InvoicesRepository } from './invoices.repository';
import { InvoiceEmailPreviewService } from './invoice-email-preview.service';
import { InvoicesResolver } from './invoices.resolver';
import { InvoicesService } from './invoices.service';

@Module({
  providers: [
    InvoicesRepository,
    InvoicesService,
    InvoiceEmailPreviewService,
    InvoicesResolver,
  ],
  exports: [InvoicesService],
})
export class InvoicesModule {}
