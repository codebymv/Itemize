import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class ListSuggestionsInput {
  @Field()
  listTitle: string;

  @Field(() => [String])
  existingItems: string[];

  @Field(() => Boolean, { nullable: true })
  forceRefresh?: boolean;
}

@InputType()
export class NoteSuggestionsInput {
  @Field()
  content: string;

  @Field(() => Boolean, { nullable: true })
  forceRefresh?: boolean;
}

@InputType()
export class MarketingChatMessageInput {
  @Field()
  role: string;

  @Field()
  content: string;
}

@InputType()
export class MarketingChatAskInput {
  @Field()
  token: string;

  @Field(() => [MarketingChatMessageInput])
  messages: MarketingChatMessageInput[];
}
