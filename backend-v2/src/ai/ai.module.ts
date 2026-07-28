import { Module } from '@nestjs/common';
import { AiProviderService } from './ai-provider.service';
import { AiRateLimitService } from './ai-rate-limit.service';
import { AiResolver } from './ai.resolver';
import { MarketingChatCapabilityService } from './marketing-chat-capability.service';

@Module({
  providers: [
    AiResolver,
    AiProviderService,
    AiRateLimitService,
    MarketingChatCapabilityService,
  ],
})
export class AiModule {}
