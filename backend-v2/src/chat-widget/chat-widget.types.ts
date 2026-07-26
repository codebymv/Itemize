import { Field, Int, ObjectType } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';

@ObjectType()
export class ChatWidgetConfig {
  @Field(() => Int) id: number;
  @Field(() => Int) organizationId: number;
  @Field() widgetKey: string;
  @Field() name: string;
  @Field() primaryColor: string;
  @Field() textColor: string;
  @Field() position: string;
  @Field() iconStyle: string;
  @Field(() => String, { nullable: true }) customIconUrl: string | null;
  @Field() welcomeTitle: string;
  @Field() welcomeMessage: string;
  @Field() placeholderText: string;
  @Field() requireEmail: boolean;
  @Field() requireName: boolean;
  @Field() requirePhone: boolean;
  @Field(() => GraphQLJSON) customFields: unknown[];
  @Field() isActive: boolean;
  @Field(() => Int) autoOpenDelay: number;
  @Field() showBranding: boolean;
  @Field() notificationSound: boolean;
  @Field(() => GraphQLJSON, { nullable: true })
  businessHours: Record<string, unknown> | null;
  @Field() offlineMessage: string;
  @Field(() => Int, { nullable: true }) defaultAssignedTo: number | null;
  @Field() autoAssignAvailable: boolean;
  @Field(() => Int) totalConversations: number;
  @Field(() => Int) totalMessages: number;
  @Field(() => [String]) allowedDomains: string[];
  @Field() createdAt: Date;
  @Field() updatedAt: Date;
}

@ObjectType()
export class ChatWidgetEmbedCode {
  @Field() widgetKey: string;
  @Field() embedCode: string;
}

@ObjectType()
export class ChatMessage {
  @Field(() => Int) id: number;
  @Field(() => Int) sessionId: number;
  @Field(() => Int) organizationId: number;
  @Field() senderType: string;
  @Field(() => Int, { nullable: true }) senderUserId: number | null;
  @Field() content: string;
  @Field() contentType: string;
  @Field(() => String, { nullable: true }) attachmentUrl: string | null;
  @Field(() => String, { nullable: true }) attachmentName: string | null;
  @Field(() => Int, { nullable: true }) attachmentSize: number | null;
  @Field() isRead: boolean;
  @Field(() => Date, { nullable: true }) readAt: Date | null;
  @Field(() => String, { nullable: true }) agentName: string | null;
  @Field() createdAt: Date;
}

@ObjectType()
export class ChatSession {
  @Field(() => Int) id: number;
  @Field(() => Int) organizationId: number;
  @Field(() => Int) widgetId: number;
  @Field(() => String, { nullable: true }) visitorName: string | null;
  @Field(() => String, { nullable: true }) visitorEmail: string | null;
  @Field(() => String, { nullable: true }) visitorPhone: string | null;
  @Field(() => GraphQLJSON) customData: Record<string, unknown>;
  @Field(() => String, { nullable: true }) ipAddress: string | null;
  @Field(() => String, { nullable: true }) userAgent: string | null;
  @Field(() => String, { nullable: true }) referrerUrl: string | null;
  @Field(() => String, { nullable: true }) currentPageUrl: string | null;
  @Field(() => String, { nullable: true }) country: string | null;
  @Field(() => String, { nullable: true }) city: string | null;
  @Field(() => String, { nullable: true }) timezone: string | null;
  @Field(() => Int, { nullable: true }) contactId: number | null;
  @Field(() => Int, { nullable: true }) conversationId: number | null;
  @Field() status: string;
  @Field() isOnline: boolean;
  @Field() lastSeenAt: Date;
  @Field() startedAt: Date;
  @Field(() => Date, { nullable: true }) endedAt: Date | null;
  @Field(() => String, { nullable: true }) widgetName: string | null;
  @Field(() => Int, { nullable: true }) unreadCount?: number | null;
  @Field(() => String, { nullable: true }) lastMessage?: string | null;
  @Field(() => [ChatMessage], { nullable: true })
  messages?: ChatMessage[] | null;
  @Field() createdAt: Date;
  @Field() updatedAt: Date;
}

@ObjectType()
export class ChatSessionPage {
  @Field(() => [ChatSession]) sessions: ChatSession[];
  @Field(() => Int) page: number;
  @Field(() => Int) limit: number;
  @Field(() => Int) total: number;
  @Field(() => Int) totalPages: number;
}

@ObjectType()
export class ChatAgentMessageDelivery {
  @Field() replayed: boolean;
  @Field(() => ChatMessage) message: ChatMessage;
}

@ObjectType()
export class ConvertChatSessionResult {
  @Field() success: boolean;
  @Field(() => Int) contactId: number;
  @Field(() => Int) conversationId: number;
}
