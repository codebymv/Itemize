import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailWebhookJobsService } from './email-webhook-jobs.service';
import { EmailWebhookJobsSchedulerService } from './email-webhook-jobs-scheduler.service';
import { EmailWebhooksController } from './email-webhooks.controller';
import { EmailWebhooksService } from './email-webhooks.service';
import {
  RESEND_WEBHOOK_VERIFIER,
  SdkResendWebhookVerifier,
} from './resend-webhook.verifier';

@Module({
  imports: [NotificationsModule],
  controllers: [EmailWebhooksController],
  providers: [
    EmailWebhooksService,
    EmailWebhookJobsService,
    EmailWebhookJobsSchedulerService,
    { provide: RESEND_WEBHOOK_VERIFIER, useClass: SdkResendWebhookVerifier },
  ],
})
export class EmailWebhooksModule {}
