import { Module } from '@nestjs/common';
import { BillingRepository } from './billing.repository';
import { BillingResolver } from './billing.resolver';
import { BillingService } from './billing.service';
import { StripeBillingProvider } from './stripe-billing.provider';

@Module({
  providers: [
    BillingRepository,
    BillingResolver,
    BillingService,
    StripeBillingProvider,
  ],
})
export class BillingModule {}
