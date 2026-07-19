import { Module } from '@nestjs/common';
import { InvoicesRepository } from './invoices.repository';
import { InvoicesResolver } from './invoices.resolver';
import { InvoicesService } from './invoices.service';

@Module({
  providers: [InvoicesRepository, InvoicesService, InvoicesResolver],
  exports: [InvoicesService],
})
export class InvoicesModule {}
