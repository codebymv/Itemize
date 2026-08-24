import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Request } from 'express';
import { CsrfProtected, Public } from '../common/metadata';
import { AiProviderService } from './ai-provider.service';
import { AiRateLimitService } from './ai-rate-limit.service';
import {
  ListSuggestionsInput,
  MarketingChatAskInput,
  NoteSuggestionsInput,
} from './ai.inputs';
import {
  AiSuggestionsPayload,
  MarketingChatReplyPayload,
  MarketingChatTokenPayload,
} from './ai.types';
import { MarketingChatCapabilityService } from './marketing-chat-capability.service';

@Resolver()
export class AiResolver {
  constructor(
    private readonly provider: AiProviderService,
    private readonly capabilities: MarketingChatCapabilityService,
    private readonly rateLimit: AiRateLimitService,
  ) {}

  @CsrfProtected()
  @Mutation(() => AiSuggestionsPayload)
  listSuggestions(
    @Args('input') input: ListSuggestionsInput,
    @Context() context: { req: Request },
  ) {
    this.rateLimit.consume(context.req, 'workspace-suggestions', 120);
    return this.provider.listSuggestions(input.listTitle, input.existingItems);
  }

  @CsrfProtected()
  @Mutation(() => AiSuggestionsPayload)
  noteSuggestions(
    @Args('input') input: NoteSuggestionsInput,
    @Context() context: { req: Request },
  ) {
    this.rateLimit.consume(context.req, 'workspace-suggestions', 120);
    return this.provider.noteSuggestions(input.content);
  }

  @Public()
  @Query(() => MarketingChatTokenPayload)
  marketingChatToken(@Context() context: { req: Request }): MarketingChatTokenPayload {
    this.rateLimit.consume(context.req, 'marketing-token', 60);
    return { token: this.capabilities.issue() };
  }

  @Public()
  @Mutation(() => MarketingChatReplyPayload)
  async marketingChatAsk(
    @Args('input') input: MarketingChatAskInput,
    @Context() context: { req: Request },
  ): Promise<MarketingChatReplyPayload> {
    this.rateLimit.consume(context.req, 'marketing-ask', 30);
    this.capabilities.consume(input.token);
    return { reply: await this.provider.marketingAnswer(input.messages) };
  }
}
