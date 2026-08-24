import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class ListSuggestionsInput {
  @Field()
  listTitle: string;

  @Field(() => [String])
  existingItems: string[];
}

@InputType()
export class NoteSuggestionsInput {
  @Field()
  content: string;
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
