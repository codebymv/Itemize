import { Module } from '@nestjs/common';
import {
  MetaSocialMessageProvider,
  SOCIAL_MESSAGE_PROVIDER,
} from './social-message.provider';
import { SocialMessageDeliverySchedulerService } from './social-message-delivery-scheduler.service';
import { SocialRepository } from './social.repository';
import { SocialResolver } from './social.resolver';
import { SocialService } from './social.service';

@Module({
  providers: [
    SocialRepository,
    SocialService,
    SocialResolver,
    SocialMessageDeliverySchedulerService,
    MetaSocialMessageProvider,
    {
      provide: SOCIAL_MESSAGE_PROVIDER,
      useExisting: MetaSocialMessageProvider,
    },
  ],
  exports: [SocialService],
})
export class SocialModule {}
