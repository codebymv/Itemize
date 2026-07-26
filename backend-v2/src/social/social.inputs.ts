import { Field, InputType, Int } from '@nestjs/graphql';

@InputType()
export class UpdateSocialConversationInput {
  @Field(() => String, { nullable: true }) status?: string;
  @Field(() => Int, { nullable: true }) assignedTo?: number | null;
  @Field(() => Int, { nullable: true }) contactId?: number | null;
  @Field(() => [String], { nullable: true }) tags?: string[];
}

@InputType()
export class SendSocialMessageInput {
  @Field() text: string;
  @Field() idempotencyKey: string;
}
