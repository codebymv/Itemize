import { Module } from '@nestjs/common';
import { SmsWebhooksController } from './sms-webhooks.controller';
import { SmsWebhooksService } from './sms-webhooks.service';
import {
  SdkTwilioWebhookVerifier,
  TWILIO_WEBHOOK_VERIFIER,
} from './twilio-webhook.verifier';

@Module({
  controllers: [SmsWebhooksController],
  providers: [
    SmsWebhooksService,
    { provide: TWILIO_WEBHOOK_VERIFIER, useClass: SdkTwilioWebhookVerifier },
  ],
})
export class SmsWebhooksModule {}
