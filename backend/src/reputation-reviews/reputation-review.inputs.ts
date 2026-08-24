import { Field, GraphQLISODateTime, InputType, Int } from '@nestjs/graphql';

@InputType()
export class ReputationReviewFilterInput {
  @Field({ nullable: true })
  platform?: string;

  @Field(() => Int, { nullable: true })
  rating?: number;

  @Field({ nullable: true })
  status?: string;

  @Field({ nullable: true })
  sentiment?: string;

  @Field({ nullable: true })
  search?: string;
}

@InputType()
export class CreateReputationReviewInput {
  @Field({ nullable: true })
  platform?: string;

  @Field(() => Int, { nullable: true })
  platformId?: number;

  @Field(() => Int)
  rating: number;

  @Field(() => String, { nullable: true })
  reviewText?: string | null;

  @Field(() => String, { nullable: true })
  reviewerName?: string | null;

  @Field(() => String, { nullable: true })
  reviewerEmail?: string | null;

  @Field(() => String, { nullable: true })
  reviewerPhone?: string | null;

  @Field(() => Int, { nullable: true })
  contactId?: number | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  reviewDate?: Date;
}

@InputType()
export class UpdateReputationReviewInput {
  @Field({ nullable: true })
  status?: string;

  @Field(() => String, { nullable: true })
  responseText?: string | null;

  @Field(() => String, { nullable: true })
  internalNotes?: string | null;

  @Field(() => Int, { nullable: true })
  contactId?: number | null;
}
