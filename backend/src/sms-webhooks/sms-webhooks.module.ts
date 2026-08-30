import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SmsWebhooksController } from './sms-webhooks.controller';
import { SmsWebhooksService } from './sms-webhooks.service';
import {
  SdkTwilioWebhookVerifier,
  TWILIO_WEBHOOK_VERIFIER,
} from './twilio-webhook.verifier';

@Module({
  imports: [NotificationsModule],
  controllers: [SmsWebhooksController],
  providers: [
    SmsWebhooksService,
    { provide: TWILIO_WEBHOOK_VERIFIER, useClass: SdkTwilioWebhookVerifier },
  ],
})
export class SmsWebhooksModule {}
