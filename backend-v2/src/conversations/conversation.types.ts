import { Field, Int, ObjectType } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';

@ObjectType()
export class ConversationMessage {
  @Field(() => Int) id: number;
  @Field(() => Int) conversationId: number;
  @Field(() => Int) organizationId: number;
  @Field() senderType: string;
  @Field(() => Int, { nullable: true }) senderUserId: number | null;
  @Field(() => Int, { nullable: true }) senderContactId: number | null;
  @Field(() => String, { nullable: true }) senderUserName: string | null;
  @Field(() => String, { nullable: true }) senderContactFirstName: string | null;
  @Field(() => String, { nullable: true }) senderContactLastName: string | null;
  @Field() channel: string;
  @Field() content: string;
  @Field(() => String, { nullable: true }) contentHtml: string | null;
  @Field(() => GraphQLJSON) metadata: Record<string, unknown>;
  @Field() isRead: boolean;
  @Field() createdAt: Date;
}

@ObjectType()
export class Conversation {
  @Field(() => Int) id: number;
  @Field(() => Int) organizationId: number;
  @Field(() => Int, { nullable: true }) contactId: number | null;
  @Field(() => Int, { nullable: true }) assignedTo: number | null;
  @Field(() => String, { nullable: true }) assignedToName: string | null;
  @Field() status: string;
  @Field(() => Date, { nullable: true }) snoozedUntil: Date | null;
  @Field() channel: string;
  @Field(() => String, { nullable: true }) subject: string | null;
  @Field(() => Date, { nullable: true }) lastMessageAt: Date | null;
  @Field(() => String, { nullable: true }) lastMessagePreview: string | null;
  @Field(() => Int) unreadCount: number;
  @Field() createdAt: Date;
  @Field() updatedAt: Date;
  @Field(() => String, { nullable: true }) contactFirstName: string | null;
  @Field(() => String, { nullable: true }) contactLastName: string | null;
  @Field(() => String, { nullable: true }) contactEmail: string | null;
  @Field(() => String, { nullable: true }) contactPhone: string | null;
  @Field(() => [ConversationMessage], { nullable: true })
  messages?: ConversationMessage[] | null;
}

@ObjectType()
export class ConversationPage {
  @Field(() => [Conversation]) conversations: Conversation[];
  @Field(() => Int) page: number;
  @Field(() => Int) limit: number;
  @Field(() => Int) total: number;
  @Field(() => Int) totalPages: number;
}
