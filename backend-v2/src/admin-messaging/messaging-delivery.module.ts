import { Module } from '@nestjs/common';
import { AdminOperationsModule } from '../admin-operations/admin-operations.module';
import { AdminEmailDeliveryResolver } from './admin-email-delivery.resolver';
import { AdminEmailDeliverySchedulerService } from './admin-email-delivery-scheduler.service';
import { AdminEmailDeliveryService } from './admin-email-delivery.service';
import { ADMIN_EMAIL_PROVIDER, ResendAdminEmailProvider } from './admin-email.provider';
import { AdminMessagingRepository } from './admin-messaging.repository';

@Module({
  imports: [AdminOperationsModule],
  providers: [
    AdminMessagingRepository, AdminEmailDeliveryService, AdminEmailDeliveryResolver,
    AdminEmailDeliverySchedulerService, ResendAdminEmailProvider,
    { provide: ADMIN_EMAIL_PROVIDER, useExisting: ResendAdminEmailProvider },
  ],
  exports: [AdminEmailDeliveryService],
})
export class MessagingDeliveryModule {}
