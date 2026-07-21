import { Field, Float, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';
import { PageInfo } from '../common/pagination';

@ObjectType()
export class CampaignLink {
  @Field(() => Int)
  id: number;
  @Field(() => Int)
  campaignId: number;
  @Field(() => String)
  originalUrl: string;
  @Field(() => String, { nullable: true })
  trackingUrl: string | null;
  @Field(() => String, { nullable: true })
  linkText: string | null;
  @Field(() => Int, { nullable: true })
  linkPosition: number | null;
  @Field(() => Int)
  totalClicks: number;
  @Field(() => Int)
  uniqueClicks: number;
  @Field(() => GraphQLISODateTime)
  createdAt: Date;
}

@ObjectType()
export class Campaign {
  @Field(() => Int)
  id: number;
  @Field(() => Int)
  organizationId: number;
  @Field(() => String)
  name: string;
  @Field(() => String)
  subject: string;
  @Field(() => String, { nullable: true })
  fromName: string | null;
  @Field(() => String, { nullable: true })
  fromEmail: string | null;
  @Field(() => String, { nullable: true })
  replyTo: string | null;
  @Field(() => Int, { nullable: true })
  templateId: number | null;
  @Field(() => String, { nullable: true })
  contentHtml: string | null;
  @Field(() => String, { nullable: true })
  contentText: string | null;
  @Field(() => String)
  segmentType: string;
  @Field(() => Int, { nullable: true })
  segmentId: number | null;
  @Field(() => GraphQLJSON)
  segmentFilter: Record<string, unknown>;
  @Field(() => [Int])
  tagIds: number[];
  @Field(() => [Int])
  excludedTagIds: number[];
  @Field(() => String)
  status: string;
  @Field(() => GraphQLISODateTime, { nullable: true })
  scheduledAt: Date | null;
  @Field(() => Boolean)
  sendImmediately: boolean;
  @Field(() => String)
  timezone: string;
  @Field(() => Boolean)
  isAbTest: boolean;
  @Field(() => GraphQLJSON, { nullable: true })
  abVariants: unknown | null;
  @Field(() => String, { nullable: true })
  abWinnerCriteria: string | null;
  @Field(() => Int, { nullable: true })
  abTestDurationHours: number | null;
  @Field(() => Int)
  totalRecipients: number;
  @Field(() => Int)
  totalSent: number;
  @Field(() => Int)
  totalDelivered: number;
  @Field(() => Int)
  totalOpened: number;
  @Field(() => Int)
  totalClicked: number;
  @Field(() => Int)
  totalBounced: number;
  @Field(() => Int)
  totalUnsubscribed: number;
  @Field(() => Int)
  totalComplained: number;
  @Field(() => Float)
  openRate: number;
  @Field(() => Float)
  clickRate: number;
  @Field(() => Float)
  bounceRate: number;
  @Field(() => Int, { nullable: true })
  createdById: number | null;
  @Field(() => Int, { nullable: true })
  sentById: number | null;
  @Field(() => GraphQLISODateTime, { nullable: true })
  startedAt: Date | null;
  @Field(() => GraphQLISODateTime, { nullable: true })
  completedAt: Date | null;
  @Field(() => GraphQLISODateTime)
  createdAt: Date;
  @Field(() => GraphQLISODateTime)
  updatedAt: Date;
  @Field(() => String, { nullable: true })
  templateName: string | null;
  @Field(() => String, { nullable: true })
  templateHtml: string | null;
  @Field(() => String, { nullable: true })
  createdByName: string | null;
  @Field(() => String, { nullable: true })
  sentByName: string | null;
  @Field(() => [CampaignLink])
  links: CampaignLink[];
}

@ObjectType()
export class CampaignPage {
  @Field(() => [Campaign])
  nodes: Campaign[];
  @Field(() => PageInfo)
  pageInfo: PageInfo;
}

@ObjectType()
export class CampaignAudiencePreview {
  @Field(() => Int)
  recipientCount: number;
  @Field(() => String)
  segmentType: string;
  @Field(() => Int, { nullable: true })
  segmentId: number | null;
  @Field(() => [Int])
  tagIds: number[];
  @Field(() => [Int])
  excludedTagIds: number[];
}

@ObjectType()
export class DeleteCampaignResult {
  @Field(() => Int)
  deletedId: number;
  @Field(() => Boolean)
  success: boolean;
}
