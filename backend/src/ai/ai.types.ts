import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class AiSuggestionsPayload {
  @Field(() => [String])
  suggestions: string[];

  @Field({ nullable: true })
  cached?: boolean;

  @Field({ nullable: true })
  error?: string;
}

@ObjectType()
export class MarketingChatTokenPayload {
  @Field()
  token: string;
}

@ObjectType()
export class MarketingChatReplyPayload {
  @Field()
  reply: string;
}
