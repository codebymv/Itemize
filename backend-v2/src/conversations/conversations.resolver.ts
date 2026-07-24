import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import {
  CreateConversationInput,
  SendConversationMessageInput,
  UpdateConversationInput,
} from './conversation.inputs';
import {
  Conversation,
  ConversationMessage,
  ConversationPage,
} from './conversation.types';
import { ConversationsService } from './conversations.service';

@OrganizationScoped()
@Resolver(() => Conversation)
export class ConversationsResolver {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly requestContext: RequestContextService,
  ) {}

  @Query(() => ConversationPage, { name: 'conversations' })
  conversationsList(
    @Args('status', { type: () => String, nullable: true }) status?: string,
    @Args('assignedTo', { type: () => Int, nullable: true })
    assignedTo?: number,
    @Args('contactId', { type: () => Int, nullable: true }) contactId?: number,
    @Args('page', { type: () => Int, defaultValue: 1 }) page?: number,
    @Args('limit', { type: () => Int, defaultValue: 50 }) limit?: number,
  ): Promise<ConversationPage> {
    return this.conversations.list(this.organizationId(), {
      status,
      assignedTo,
      contactId,
      page,
      limit,
    });
  }

  @Query(() => Conversation)
  conversation(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<Conversation> {
    return this.conversations.get(this.organizationId(), id);
  }

  @CsrfProtected()
  @Mutation(() => Conversation)
  createConversation(
    @Args('input') input: CreateConversationInput,
  ): Promise<Conversation> {
    return this.conversations.create(
      this.organizationId(),
      this.userId(),
      input,
    );
  }

  @CsrfProtected()
  @Mutation(() => Conversation)
  updateConversation(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: UpdateConversationInput,
  ): Promise<Conversation> {
    return this.conversations.update(this.organizationId(), id, input);
  }

  @CsrfProtected()
  @Mutation(() => Conversation)
  assignConversation(
    @Args('id', { type: () => Int }) id: number,
    @Args('assignedTo', { type: () => Int, nullable: true })
    assignedTo: number | null,
  ): Promise<Conversation> {
    return this.conversations.assign(
      this.organizationId(),
      id,
      assignedTo,
    );
  }

  @CsrfProtected()
  @Mutation(() => Conversation)
  markConversationRead(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<Conversation> {
    return this.conversations.markRead(this.organizationId(), id);
  }

  @CsrfProtected()
  @Mutation(() => ConversationMessage)
  sendConversationMessage(
    @Args('conversationId', { type: () => Int }) conversationId: number,
    @Args('input') input: SendConversationMessageInput,
  ): Promise<ConversationMessage> {
    return this.conversations.sendMessage(
      this.organizationId(),
      this.userId(),
      conversationId,
      input,
    );
  }

  private organizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization) {
      throw new Error('Verified organization context is unavailable');
    }
    return organization.organizationId;
  }

  private userId(): number {
    const identity = this.requestContext.current().identity;
    if (!identity) throw new Error('Verified identity context is unavailable');
    return identity.userId;
  }
}
