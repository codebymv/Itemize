import { Module } from '@nestjs/common';
import { EmailWebhooksController } from './email-webhooks.controller';
import { EmailWebhooksService } from './email-webhooks.service';
import {
  RESEND_WEBHOOK_VERIFIER,
  SdkResendWebhookVerifier,
} from './resend-webhook.verifier';

@Module({
  controllers: [EmailWebhooksController],
  providers: [
    EmailWebhooksService,
    { provide: RESEND_WEBHOOK_VERIFIER, useClass: SdkResendWebhookVerifier },
  ],
})
export class EmailWebhooksModule {}
