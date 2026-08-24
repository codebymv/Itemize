import { Module } from '@nestjs/common';
import { InvoiceLogoCleanupRepository } from './invoice-logo-cleanup.repository';
import { InvoiceLogoCleanupService } from './invoice-logo-cleanup.service';
import {
  INVOICE_LOGO_STORAGE,
  LegacyInvoiceLogoStorage,
} from './invoice-logo-storage.provider';

@Module({
  providers: [
    InvoiceLogoCleanupRepository,
    InvoiceLogoCleanupService,
    LegacyInvoiceLogoStorage,
    { provide: INVOICE_LOGO_STORAGE, useExisting: LegacyInvoiceLogoStorage },
  ],
  exports: [InvoiceLogoCleanupService, INVOICE_LOGO_STORAGE],
})
export class InvoiceLogoCleanupModule {}
