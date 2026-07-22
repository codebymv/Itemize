import { Field, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';
import { PageInfo } from '../common/pagination';

@ObjectType()
export class ReputationRequest {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  organizationId: number;

  @Field(() => Int, { nullable: true })
  contactId: number | null;

  @Field(() => String, { nullable: true })
  contactEmail: string | null;

  @Field(() => String, { nullable: true })
  contactPhone: string | null;

  @Field(() => String, { nullable: true })
  contactName: string | null;

  @Field(() => String)
  channel: string;

  @Field(() => Int, { nullable: true })
  templateId: number | null;

  @Field(() => Boolean)
  emailSent: boolean;

  @Field(() => GraphQLISODateTime, { nullable: true })
  emailSentAt: Date | null;

  @Field(() => Boolean)
  emailOpened: boolean;

  @Field(() => GraphQLISODateTime, { nullable: true })
  emailOpenedAt: Date | null;

  @Field(() => Boolean)
  smsSent: boolean;

  @Field(() => GraphQLISODateTime, { nullable: true })
  smsSentAt: Date | null;

  @Field(() => Boolean)
  clicked: boolean;

  @Field(() => GraphQLISODateTime, { nullable: true })
  clickedAt: Date | null;

  @Field(() => Int, { nullable: true })
  ratingGiven: number | null;

  @Field(() => Boolean)
  reviewSubmitted: boolean;

  @Field(() => GraphQLISODateTime, { nullable: true })
  reviewSubmittedAt: Date | null;

  @Field(() => Int, { nullable: true })
  reviewId: number | null;

  @Field(() => String, { nullable: true })
  preferredPlatform: string | null;

  @Field(() => String, { nullable: true })
  redirectUrl: string | null;

  @Field(() => String)
  status: string;

  @Field(() => GraphQLISODateTime, { nullable: true })
  scheduledAt: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  expiresAt: Date | null;

  @Field(() => String, { nullable: true })
  customMessage: string | null;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;

  @Field(() => String, { nullable: true })
  contactFirstName: string | null;

  @Field(() => String, { nullable: true })
  contactLastName: string | null;

  @Field(() => String, { nullable: true })
  currentContactEmail: string | null;
}

@ObjectType()
export class ReputationRequestPage {
  @Field(() => [ReputationRequest])
  nodes: ReputationRequest[];

  @Field(() => PageInfo)
  pageInfo: PageInfo;
}

@ObjectType()
export class DeleteReputationRequestResult {
  @Field(() => Int)
  deletedId: number;
}
