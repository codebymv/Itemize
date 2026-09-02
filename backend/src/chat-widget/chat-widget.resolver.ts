import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped, RequiresPlan } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import {
  ChatWidgetConfigInput,
  SendAgentChatMessageInput,
} from './chat-widget.inputs';
import { ChatWidgetService } from './chat-widget.service';
import {
  ChatAgentMessageDelivery,
  ChatSession,
  ChatSessionPage,
  ChatWidgetConfig,
  ChatWidgetEmbedCode,
  ConvertChatSessionResult,
} from './chat-widget.types';

@RequiresPlan()
@OrganizationScoped()
@Resolver()
export class ChatWidgetResolver {
  constructor(
    private readonly service: ChatWidgetService,
    private readonly requestContext: RequestContextService,
  ) {}

  @Query(() => ChatWidgetConfig, { nullable: true })
  chatWidget(): Promise<ChatWidgetConfig | null> {
    return this.service.widget(this.organizationId());
  }

  @Query(() => ChatWidgetEmbedCode)
  chatWidgetEmbedCode(): Promise<ChatWidgetEmbedCode> {
    return this.service.embedCode(this.organizationId());
  }

  @Query(() => ChatSessionPage)
  chatSessions(
    @Args('status', { type: () => String, defaultValue: 'active' })
    status?: string,
    @Args('page', { type: () => Int, defaultValue: 1 }) page?: number,
    @Args('limit', { type: () => Int, defaultValue: 50 }) limit?: number,
  ): Promise<ChatSessionPage> {
    return this.service.sessions(this.organizationId(), {
      status,
      page,
      limit,
    });
  }

  @Query(() => ChatSession)
  chatSession(
    @Args('sessionId', { type: () => Int }) sessionId: number,
  ): Promise<ChatSession> {
    return this.service.session(this.organizationId(), sessionId);
  }

  @CsrfProtected()
  @Mutation(() => ChatWidgetConfig)
  createChatWidget(
    @Args('input') input: ChatWidgetConfigInput,
    @Args('idempotencyKey', { type: () => String }) idempotencyKey: string,
  ): Promise<ChatWidgetConfig> {
    return this.service.createWidget(
      this.organizationId(), this.userId(), input, idempotencyKey,
    );
  }

  @CsrfProtected()
  @Mutation(() => ChatWidgetConfig)
  updateChatWidget(
    @Args('input') input: ChatWidgetConfigInput,
  ): Promise<ChatWidgetConfig> {
    return this.service.updateWidget(this.organizationId(), input);
  }

  @CsrfProtected()
  @Mutation(() => ChatAgentMessageDelivery)
  sendAgentChatMessage(
    @Args('sessionId', { type: () => Int }) sessionId: number,
    @Args('input') input: SendAgentChatMessageInput,
  ): Promise<ChatAgentMessageDelivery> {
    return this.service.sendAgentMessage(
      this.organizationId(),
      this.userId(),
      sessionId,
      input,
    );
  }

  @CsrfProtected()
  @Mutation(() => ConvertChatSessionResult)
  convertChatSession(
    @Args('sessionId', { type: () => Int }) sessionId: number,
  ): Promise<ConvertChatSessionResult> {
    return this.service.convertSession(
      this.organizationId(),
      this.userId(),
      sessionId,
    );
  }

  private organizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization) throw new Error('Verified organization context is unavailable');
    return organization.organizationId;
  }

  private userId(): number {
    const identity = this.requestContext.current().identity;
    if (!identity) throw new Error('Verified identity context is unavailable');
    return identity.userId;
  }
}
