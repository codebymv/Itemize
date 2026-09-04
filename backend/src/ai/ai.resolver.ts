import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Request } from 'express';
import { AccountScoped, CsrfProtected, Public } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
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
    private readonly requestContext: RequestContextService,
  ) {}

  @CsrfProtected()
  @AccountScoped()
  @Mutation(() => AiSuggestionsPayload)
  listSuggestions(
    @Args('input') input: ListSuggestionsInput,
    @Context() context: { req: Request },
  ) {
    this.consumeWorkspaceSuggestion(context.req);
    return this.provider.listSuggestions(input.listTitle, input.existingItems, input.forceRefresh);
  }

  @CsrfProtected()
  @AccountScoped()
  @Mutation(() => AiSuggestionsPayload)
  noteSuggestions(
    @Args('input') input: NoteSuggestionsInput,
    @Context() context: { req: Request },
  ) {
    this.consumeWorkspaceSuggestion(context.req);
    return this.provider.noteSuggestions(input.content, input.forceRefresh);
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

  private consumeWorkspaceSuggestion(request: Request): void {
    const requestContext = this.requestContext.current();
    const userId = requestContext.identity?.userId;
    if (!userId) throw new Error('Verified user identity is unavailable');
    const organizationId = requestContext.organization?.organizationId;
    const actorId = organizationId ? `${organizationId}:${userId}` : String(userId);
    this.rateLimit.consume(request, 'workspace-suggestions', 120, actorId);
  }
}
