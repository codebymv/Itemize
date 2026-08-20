import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped, RequiresPlan } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { SendSocialMessageInput, UpdateSocialConversationInput } from './social.inputs';
import { SocialService } from './social.service';
import {
  DisconnectSocialChannelResult,
  SocialAnalytics,
  SocialChannel,
  SocialConversation,
  SocialConversationPage,
  SocialMessageDelivery,
} from './social.types';

@RequiresPlan('unlimited')
@OrganizationScoped()
@Resolver()
export class SocialResolver {
  constructor(
    private readonly social: SocialService,
    private readonly requestContext: RequestContextService,
  ) {}

  @Query(() => [SocialChannel])
  socialChannels(
    @Args('channelType', { type: () => String, nullable: true })
    channelType?: string,
  ): Promise<SocialChannel[]> {
    return this.social.channels(this.organizationId(), channelType);
  }

  @Query(() => SocialConversationPage)
  socialConversations(
    @Args('channelId', { type: () => Int, nullable: true }) channelId?: number,
    @Args('channelType', { type: () => String, nullable: true })
    channelType?: string,
    @Args('status', { type: () => String, nullable: true }) status?: string,
    @Args('assignedTo', { type: () => Int, nullable: true })
    assignedTo?: number,
    @Args('page', { type: () => Int, defaultValue: 1 }) page?: number,
    @Args('limit', { type: () => Int, defaultValue: 20 }) limit?: number,
  ): Promise<SocialConversationPage> {
    return this.social.conversations(this.organizationId(), {
      channelId,
      channelType,
      status,
      assignedTo,
      page,
      limit,
    });
  }

  @Query(() => SocialConversation)
  socialConversation(
    @Args('conversationId', { type: () => Int }) conversationId: number,
  ): Promise<SocialConversation> {
    return this.social.conversation(this.organizationId(), conversationId);
  }

  @Query(() => SocialAnalytics)
  socialAnalytics(
    @Args('period', { type: () => Int, defaultValue: 30 }) period: number,
  ): Promise<SocialAnalytics> {
    return this.social.analytics(this.organizationId(), period);
  }

  @CsrfProtected()
  @Mutation(() => DisconnectSocialChannelResult)
  disconnectSocialChannel(
    @Args('channelId', { type: () => Int }) channelId: number,
  ): Promise<DisconnectSocialChannelResult> {
    return this.social.disconnectChannel(this.organizationId(), channelId);
  }

  @CsrfProtected()
  @Mutation(() => SocialConversation)
  openSocialConversation(
    @Args('conversationId', { type: () => Int }) conversationId: number,
  ): Promise<SocialConversation> {
    return this.social.openConversation(this.organizationId(), conversationId);
  }

  @CsrfProtected()
  @Mutation(() => SocialConversation)
  updateSocialConversation(
    @Args('conversationId', { type: () => Int }) conversationId: number,
    @Args('input') input: UpdateSocialConversationInput,
  ): Promise<SocialConversation> {
    return this.social.updateConversation(
      this.organizationId(),
      conversationId,
      input,
    );
  }

  @CsrfProtected()
  @Mutation(() => SocialMessageDelivery)
  sendSocialMessage(
    @Args('conversationId', { type: () => Int }) conversationId: number,
    @Args('input') input: SendSocialMessageInput,
  ): Promise<SocialMessageDelivery> {
    return this.social.sendMessage(
      this.organizationId(),
      this.userId(),
      conversationId,
      input,
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
