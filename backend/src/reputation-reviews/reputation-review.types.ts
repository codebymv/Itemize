import { Field, Float, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';
import { PageInfo } from '../common/pagination';

@ObjectType()
export class ReputationReview {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  organizationId: number;

  @Field(() => Int, { nullable: true })
  platformId: number | null;

  @Field()
  platform: string;

  @Field(() => String, { nullable: true })
  externalReviewId: string | null;

  @Field(() => Int)
  rating: number;

  @Field(() => String, { nullable: true })
  reviewText: string | null;

  @Field(() => String, { nullable: true })
  reviewerName: string | null;

  @Field(() => String, { nullable: true })
  reviewerEmail: string | null;

  @Field(() => String, { nullable: true })
  reviewerPhone: string | null;

  @Field(() => String, { nullable: true })
  reviewerAvatarUrl: string | null;

  @Field(() => String, { nullable: true })
  reviewerProfileUrl: string | null;

  @Field(() => Int, { nullable: true })
  contactId: number | null;

  @Field()
  status: string;

  @Field(() => String, { nullable: true })
  responseText: string | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  respondedAt: Date | null;

  @Field(() => Int, { nullable: true })
  respondedBy: number | null;

  @Field(() => String, { nullable: true })
  internalNotes: string | null;

  @Field(() => String, { nullable: true })
  sentiment: string | null;

  @Field(() => Float, { nullable: true })
  sentimentScore: number | null;

  @Field()
  source: string;

  @Field(() => Int, { nullable: true })
  reviewRequestId: number | null;

  @Field(() => GraphQLISODateTime)
  reviewDate: Date;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;

  @Field(() => String, { nullable: true })
  platformName: string | null;

  @Field(() => String, { nullable: true })
  platformReviewUrl: string | null;

  @Field(() => String, { nullable: true })
  contactFirstName: string | null;

  @Field(() => String, { nullable: true })
  contactLastName: string | null;

  @Field(() => String, { nullable: true })
  contactEmail: string | null;
}

@ObjectType()
export class ReputationReviewPage {
  @Field(() => [ReputationReview])
  nodes: ReputationReview[];

  @Field(() => PageInfo)
  pageInfo: PageInfo;
}

@ObjectType()
export class DeleteReputationReviewResult {
  @Field(() => Int)
  deletedId: number;
}
