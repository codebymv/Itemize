import { Field, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';
import { PageInfo } from '../common/pagination';

@ObjectType()
export class CampaignRecipient {
  @Field(() => Int)
  id: number;
  @Field(() => Int)
  campaignId: number;
  @Field(() => Int)
  contactId: number;
  @Field(() => Int)
  organizationId: number;
  @Field(() => String)
  email: string;
  @Field(() => String, { nullable: true })
  firstName: string | null;
  @Field(() => String, { nullable: true })
  lastName: string | null;
  @Field(() => String)
  status: string;
  @Field(() => GraphQLISODateTime, { nullable: true })
  sentAt: Date | null;
  @Field(() => GraphQLISODateTime, { nullable: true })
  deliveredAt: Date | null;
  @Field(() => GraphQLISODateTime, { nullable: true })
  openedAt: Date | null;
  @Field(() => GraphQLISODateTime, { nullable: true })
  clickedAt: Date | null;
  @Field(() => GraphQLISODateTime, { nullable: true })
  bouncedAt: Date | null;
  @Field(() => GraphQLISODateTime, { nullable: true })
  unsubscribedAt: Date | null;
  @Field(() => Int)
  openCount: number;
  @Field(() => Int)
  clickCount: number;
  @Field(() => GraphQLJSON)
  clickedLinks: unknown[];
  @Field(() => String, { nullable: true })
  errorMessage: string | null;
  @Field(() => String, { nullable: true })
  bounceType: string | null;
  @Field(() => Int, { nullable: true })
  emailLogId: number | null;
  @Field(() => String, { nullable: true })
  externalMessageId: string | null;
  @Field(() => String, { nullable: true })
  abVariant: string | null;
  @Field(() => GraphQLISODateTime)
  createdAt: Date;
  @Field(() => GraphQLISODateTime)
  updatedAt: Date;
  @Field(() => String, { nullable: true })
  contactFirstName: string | null;
  @Field(() => String, { nullable: true })
  contactLastName: string | null;
}

@ObjectType()
export class CampaignRecipientPage {
  @Field(() => [CampaignRecipient])
  nodes: CampaignRecipient[];
  @Field(() => PageInfo)
  pageInfo: PageInfo;
}
