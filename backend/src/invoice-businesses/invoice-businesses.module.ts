import { Module } from '@nestjs/common';
import { InvoiceBusinessesRepository } from './invoice-businesses.repository';
import { InvoiceBusinessesResolver } from './invoice-businesses.resolver';
import { InvoiceBusinessesService } from './invoice-businesses.service';

@Module({
  providers: [
    InvoiceBusinessesRepository,
    InvoiceBusinessesService,
    InvoiceBusinessesResolver,
  ],
})
export class InvoiceBusinessesModule {}
