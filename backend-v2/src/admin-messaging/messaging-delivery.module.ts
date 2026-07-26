import { Module } from '@nestjs/common';
import { AdminOperationsModule } from '../admin-operations/admin-operations.module';
import { AdminEmailDeliveryResolver } from './admin-email-delivery.resolver';
import { AdminEmailDeliverySchedulerService } from './admin-email-delivery-scheduler.service';
import { AdminEmailDeliveryService } from './admin-email-delivery.service';
import { ADMIN_EMAIL_PROVIDER, ResendAdminEmailProvider } from './admin-email.provider';
import { AdminMessagingRepository } from './admin-messaging.repository';
import {
  MESSAGE_EMAIL_PROVIDER,
  MESSAGE_SMS_PROVIDER,
  ResendMessageEmailProvider,
  TwilioMessageSmsProvider,
} from './message-delivery.providers';
import { MessageDeliveryRepository } from './message-delivery.repository';
import { MessageDeliveryResolver } from './message-delivery.resolver';
import { MessageDeliverySchedulerService } from './message-delivery-scheduler.service';
import { MessageDeliveryService } from './message-delivery.service';

@Module({
  imports: [AdminOperationsModule],
  providers: [
    AdminMessagingRepository, AdminEmailDeliveryService, AdminEmailDeliveryResolver,
    AdminEmailDeliverySchedulerService, ResendAdminEmailProvider,
    { provide: ADMIN_EMAIL_PROVIDER, useExisting: ResendAdminEmailProvider },
    MessageDeliveryRepository,
    MessageDeliveryService,
    MessageDeliveryResolver,
    MessageDeliverySchedulerService,
    ResendMessageEmailProvider,
    TwilioMessageSmsProvider,
    { provide: MESSAGE_EMAIL_PROVIDER, useExisting: ResendMessageEmailProvider },
    { provide: MESSAGE_SMS_PROVIDER, useExisting: TwilioMessageSmsProvider },
  ],
  exports: [AdminEmailDeliveryService, MessageDeliveryService],
})
export class MessagingDeliveryModule {}
