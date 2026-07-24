import { Field, InputType, Int } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';

@InputType()
export class CreateConversationInput {
  @Field(() => Int) contactId: number;
  @Field(() => String, { nullable: true }) subject?: string | null;
  @Field(() => String, { nullable: true }) channel?: string;
  @Field(() => String, { nullable: true }) initialMessage?: string | null;
}

@InputType()
export class UpdateConversationInput {
  @Field(() => String, { nullable: true }) status?: string;
  @Field(() => Date, { nullable: true }) snoozedUntil?: Date | null;
}

@InputType()
export class SendConversationMessageInput {
  @Field() content: string;
  @Field(() => String, { nullable: true }) channel?: string;
  @Field(() => String, { nullable: true }) contentHtml?: string | null;
  @Field(() => GraphQLJSON, { nullable: true })
  metadata?: Record<string, unknown>;
}
