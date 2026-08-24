import { Module } from '@nestjs/common';
import { SocialWebhooksController } from './social-webhooks.controller';
import { SocialWebhooksService } from './social-webhooks.service';

@Module({
  controllers: [SocialWebhooksController],
  providers: [SocialWebhooksService],
})
export class SocialWebhooksModule {}
