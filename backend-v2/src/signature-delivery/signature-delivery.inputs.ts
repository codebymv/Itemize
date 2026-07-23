import { Field, GraphQLISODateTime, InputType } from '@nestjs/graphql';

@InputType()
export class SignatureEmailPreviewInput {
  @Field() message: string;
  @Field(() => String, { nullable: true }) documentTitle?: string | null;
  @Field(() => String, { nullable: true }) senderName?: string | null;
  @Field(() => String, { nullable: true }) senderEmail?: string | null;
  @Field(() => String, { nullable: true }) recipientName?: string | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) expiresAt?: Date | null;
}
