import { Field, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class MessageDelivery {
  @Field(() => Int) id: number;
  @Field() kind: string;
  @Field() channel: string;
  @Field() status: string;
  @Field() accepted: boolean;
  @Field() replayed: boolean;
  @Field(() => Int, { nullable: true }) contactId: number | null;
  @Field(() => Int, { nullable: true }) templateId: number | null;
  @Field(() => Int, { nullable: true }) conversationId: number | null;
  @Field(() => Int, { nullable: true }) messageId: number | null;
  @Field(() => String, { nullable: true }) providerId: string | null;
  @Field(() => GraphQLISODateTime) createdAt: Date;
}
