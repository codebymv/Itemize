import { Module } from '@nestjs/common';
import { RealtimeHostModule } from '../realtime-host/realtime-host.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SocialWebhookJobsService } from './social-webhook-jobs.service';
import { SocialWebhookJobsSchedulerService } from './social-webhook-jobs-scheduler.service';
import { SocialWebhookProcessingService } from './social-webhook-processing.service';
import { SocialWebhooksController } from './social-webhooks.controller';
import { SocialWebhooksService } from './social-webhooks.service';

@Module({
  imports: [RealtimeHostModule, NotificationsModule],
  controllers: [SocialWebhooksController],
  providers: [
    SocialWebhooksService,
    SocialWebhookProcessingService,
    SocialWebhookJobsService,
    SocialWebhookJobsSchedulerService,
  ],
})
export class SocialWebhooksModule {}
