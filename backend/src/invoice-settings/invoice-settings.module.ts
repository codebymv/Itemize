import { Module } from '@nestjs/common';
import { InvoiceSettingsRepository } from './invoice-settings.repository';
import { InvoiceSettingsResolver } from './invoice-settings.resolver';
import { InvoiceSettingsService } from './invoice-settings.service';

@Module({
  providers: [
    InvoiceSettingsRepository,
    InvoiceSettingsService,
    InvoiceSettingsResolver,
  ],
})
export class InvoiceSettingsModule {}
