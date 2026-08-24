import { Module } from '@nestjs/common';
import { BillingRepository } from './billing.repository';
import { BillingResolver } from './billing.resolver';
import { BillingService } from './billing.service';
import { StripeBillingProvider } from './stripe-billing.provider';
import { BillingEntitlementService } from './billing-entitlement.service';
import { GraphqlEntitlementGuard } from './graphql-entitlement.guard';

@Module({
  providers: [
    BillingRepository,
    BillingResolver,
    BillingService,
    StripeBillingProvider,
    BillingEntitlementService,
    GraphqlEntitlementGuard,
  ],
  exports: [BillingEntitlementService, GraphqlEntitlementGuard],
})
export class BillingModule {}
