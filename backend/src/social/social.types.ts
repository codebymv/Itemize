import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class SocialChannel {
  @Field(() => Int) id: number;
  @Field(() => Int) organizationId: number;
  @Field() channelType: string;
  @Field() externalId: string;
  @Field() name: string;
  @Field(() => String, { nullable: true }) username: string | null;
  @Field(() => String, { nullable: true }) profilePictureUrl: string | null;
  @Field(() => String, { nullable: true }) pageId: string | null;
  @Field(() => String, { nullable: true })
  instagramBusinessAccountId: string | null;
  @Field(() => [String]) permissions: string[];
  @Field() isActive: boolean;
  @Field() isConnected: boolean;
  @Field(() => String, { nullable: true }) connectionError: string | null;
  @Field(() => Date, { nullable: true }) lastSyncedAt: Date | null;
  @Field() webhookVerified: boolean;
  @Field(() => Int, { nullable: true }) createdBy: number | null;
  @Field(() => String, { nullable: true }) createdByName: string | null;
  @Field() createdAt: Date;
  @Field() updatedAt: Date;
}

@ObjectType()
export class SocialMessage {
  @Field(() => Int) id: number;
  @Field(() => Int) organizationId: number;
  @Field(() => Int) conversationId: number;
  @Field(() => Int) channelId: number;
  @Field(() => String, { nullable: true }) externalMessageId: string | null;
  @Field() messageType: string;
  @Field(() => String, { nullable: true }) textContent: string | null;
  @Field(() => String, { nullable: true }) mediaUrl: string | null;
  @Field(() => String, { nullable: true }) mediaType: string | null;
  @Field(() => String, { nullable: true }) mediaFilename: string | null;
  @Field() direction: string;
  @Field(() => String, { nullable: true }) senderId: string | null;
  @Field(() => String, { nullable: true }) senderName: string | null;
  @Field(() => Int, { nullable: true }) sentBy: number | null;
  @Field(() => String, { nullable: true }) sentByName: string | null;
  @Field() status: string;
  @Field(() => String, { nullable: true }) errorMessage: string | null;
  @Field() messageTimestamp: Date;
  @Field(() => Date, { nullable: true }) readAt: Date | null;
  @Field() createdAt: Date;
}

@ObjectType()
export class SocialConversation {
  @Field(() => Int) id: number;
  @Field(() => Int) organizationId: number;
  @Field(() => Int) channelId: number;
  @Field(() => String, { nullable: true }) threadId: string | null;
  @Field() participantId: string;
  @Field(() => String, { nullable: true }) participantName: string | null;
  @Field(() => String, { nullable: true }) participantUsername: string | null;
  @Field(() => String, { nullable: true }) participantProfilePic: string | null;
  @Field(() => Int, { nullable: true }) contactId: number | null;
  @Field() status: string;
  @Field(() => Int, { nullable: true }) assignedTo: number | null;
  @Field(() => String, { nullable: true }) assignedToName: string | null;
  @Field(() => Int) unreadCount: number;
  @Field(() => Int) messageCount: number;
  @Field(() => String, { nullable: true }) lastMessageText: string | null;
  @Field(() => Date, { nullable: true }) lastMessageAt: Date | null;
  @Field(() => String, { nullable: true }) lastMessageFrom: string | null;
  @Field(() => [String]) tags: string[];
  @Field() channelType: string;
  @Field() channelName: string;
  @Field(() => String, { nullable: true }) contactFirstName: string | null;
  @Field(() => String, { nullable: true }) contactLastName: string | null;
  @Field(() => String, { nullable: true }) contactEmail: string | null;
  @Field() createdAt: Date;
  @Field() updatedAt: Date;
  @Field(() => [SocialMessage], { nullable: true })
  messages?: SocialMessage[] | null;
}

@ObjectType()
export class SocialConversationPage {
  @Field(() => [SocialConversation]) conversations: SocialConversation[];
  @Field(() => Int) page: number;
  @Field(() => Int) limit: number;
  @Field(() => Int) total: number;
  @Field(() => Int) totalPages: number;
}

@ObjectType()
export class SocialChannelAnalytics {
  @Field() channelType: string;
  @Field(() => Int) conversationCount: number;
  @Field(() => Int) messageCount: number;
  @Field(() => Int) inboundCount: number;
  @Field(() => Int) outboundCount: number;
}

@ObjectType()
export class SocialMessageDay {
  @Field() date: Date;
  @Field(() => Int) inbound: number;
  @Field(() => Int) outbound: number;
}

@ObjectType()
export class SocialStatusCount {
  @Field() status: string;
  @Field(() => Int) count: number;
}

@ObjectType()
export class SocialAnalytics {
  @Field(() => Int) period: number;
  @Field(() => [SocialChannelAnalytics]) channels: SocialChannelAnalytics[];
  @Field(() => Float, { nullable: true })
  averageResponseTimeMinutes: number | null;
  @Field(() => [SocialMessageDay]) messagesOverTime: SocialMessageDay[];
  @Field(() => [SocialStatusCount]) statusDistribution: SocialStatusCount[];
}

@ObjectType()
export class DisconnectSocialChannelResult {
  @Field() success: boolean;
}

@ObjectType()
export class SocialMessageDelivery {
  @Field(() => Int) id: number;
  @Field() status: string;
  @Field() accepted: boolean;
  @Field() replayed: boolean;
  @Field(() => SocialMessage) message: SocialMessage;
  @Field() createdAt: Date;
}
