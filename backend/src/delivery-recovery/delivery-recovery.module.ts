import { Module } from '@nestjs/common';
import { CampaignDeliveryModule } from '../campaign-delivery/campaign-delivery.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { InvoiceLogoCleanupModule } from '../invoice-logo-cleanup/invoice-logo-cleanup.module';
import { DeliveryRecoverySchedulerService } from './delivery-recovery-scheduler.service';

@Module({
  imports: [CampaignDeliveryModule, InvoicesModule, InvoiceLogoCleanupModule],
  providers: [DeliveryRecoverySchedulerService],
})
export class DeliveryRecoveryModule {}
