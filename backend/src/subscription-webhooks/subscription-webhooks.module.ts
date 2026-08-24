import { Module } from '@nestjs/common';
import {
  STRIPE_SUBSCRIPTION_WEBHOOK_VERIFIER,
  StripeSdkSubscriptionWebhookVerifier,
} from './stripe-subscription-webhook.verifier';
import {
  ResendSubscriptionNotificationEmailProvider,
  SUBSCRIPTION_NOTIFICATION_EMAIL_PROVIDER,
} from './subscription-notification-email.provider';
import { SubscriptionWebhookJobsService } from './subscription-webhook-jobs.service';
import { SubscriptionWebhookJobsSchedulerService } from './subscription-webhook-jobs-scheduler.service';
import { SubscriptionWebhooksController } from './subscription-webhooks.controller';
import { SubscriptionWebhooksService } from './subscription-webhooks.service';

@Module({
  controllers: [SubscriptionWebhooksController],
  providers: [
    SubscriptionWebhooksService,
    SubscriptionWebhookJobsService,
    SubscriptionWebhookJobsSchedulerService,
    {
      provide: STRIPE_SUBSCRIPTION_WEBHOOK_VERIFIER,
      useClass: StripeSdkSubscriptionWebhookVerifier,
    },
    {
      provide: SUBSCRIPTION_NOTIFICATION_EMAIL_PROVIDER,
      useClass: ResendSubscriptionNotificationEmailProvider,
    },
  ],
})
export class SubscriptionWebhooksModule {}
