import { Module } from '@nestjs/common';
import {
  STRIPE_SUBSCRIPTION_WEBHOOK_VERIFIER,
  StripeSdkSubscriptionWebhookVerifier,
} from './stripe-subscription-webhook.verifier';
import { SubscriptionWebhooksController } from './subscription-webhooks.controller';
import { SubscriptionWebhooksService } from './subscription-webhooks.service';

@Module({
  controllers: [SubscriptionWebhooksController],
  providers: [
    SubscriptionWebhooksService,
    {
      provide: STRIPE_SUBSCRIPTION_WEBHOOK_VERIFIER,
      useClass: StripeSdkSubscriptionWebhookVerifier,
    },
  ],
})
export class SubscriptionWebhooksModule {}
