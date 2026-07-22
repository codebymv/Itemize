import { Field, InputType, Int } from '@nestjs/graphql';

@InputType()
export class AdminEmailLogFilterInput {
  @Field(() => Int, { nullable: true }) page?: number;
  @Field(() => Int, { nullable: true }) limit?: number;
  @Field({ nullable: true }) status?: string;
}

@InputType()
export class AdminEmailTemplateFilterInput {
  @Field({ nullable: true }) category?: string;
  @Field({ nullable: true }) search?: string;
}

@InputType()
export class AdminEmailPreviewInput {
  @Field() subject: string;
  @Field() bodyHtml: string;
  @Field({ nullable: true }) baseUrl?: string;
}

@InputType()
export class AdminEmailRecipientInput {
  @Field(() => Int, { nullable: true }) id?: number;
  @Field() email: string;
  @Field({ nullable: true }) name?: string;
}

@InputType()
export class AdminEmailBatchInput {
  @Field(() => [AdminEmailRecipientInput]) recipients: AdminEmailRecipientInput[];
  @Field() subject: string;
  @Field() bodyHtml: string;
  @Field() idempotencyKey: string;
}
