import { Field, Float, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class ReputationPlatform {
  @Field(() => Int) id: number;
  @Field(() => Int) organizationId: number;
  @Field() platform: string;
  @Field(() => String, { nullable: true }) platformName: string | null;
  @Field(() => String, { nullable: true }) placeId: string | null;
  @Field(() => String, { nullable: true }) pageId: string | null;
  @Field(() => String, { nullable: true }) businessUrl: string | null;
  @Field(() => String, { nullable: true }) reviewUrl: string | null;
  @Field(() => Int) totalReviews: number;
  @Field(() => Float) averageRating: number;
  @Field(() => GraphQLISODateTime, { nullable: true }) lastSyncedAt: Date | null;
  @Field() isActive: boolean;
  @Field() isConnected: boolean;
  @Field(() => GraphQLISODateTime) createdAt: Date;
  @Field(() => GraphQLISODateTime) updatedAt: Date;
}

@ObjectType()
export class ReputationWidget {
  @Field(() => Int) id: number;
  @Field(() => Int) organizationId: number;
  @Field() widgetKey: string;
  @Field() name: string;
  @Field() widgetType: string;
  @Field() theme: string;
  @Field() primaryColor: string;
  @Field() backgroundColor: string;
  @Field() textColor: string;
  @Field(() => Int) borderRadius: number;
  @Field() showRatingStars: boolean;
  @Field() showReviewerPhoto: boolean;
  @Field() showReviewDate: boolean;
  @Field() showPlatformIcon: boolean;
  @Field(() => Int) minRating: number;
  @Field(() => [String]) platforms: string[];
  @Field(() => Int) maxReviews: number;
  @Field() hideNoTextReviews: boolean;
  @Field() autoRefresh: boolean;
  @Field(() => Int) refreshIntervalHours: number;
  @Field() isActive: boolean;
  @Field(() => GraphQLISODateTime) createdAt: Date;
  @Field(() => GraphQLISODateTime) updatedAt: Date;
}

@ObjectType()
export class ReputationSettings {
  @Field(() => Int, { nullable: true }) id: number | null;
  @Field(() => Int) organizationId: number;
  @Field() autoRequestEnabled: boolean;
  @Field(() => Int) autoRequestDelayDays: number;
  @Field() autoRequestChannel: string;
  @Field() autoRequestTrigger: string;
  @Field(() => Int, { nullable: true }) emailTemplateId: number | null;
  @Field(() => String, { nullable: true }) smsTemplateText: string | null;
  @Field(() => Int) negativeThreshold: number;
  @Field(() => String, { nullable: true }) negativeAlertEmail: string | null;
  @Field() negativeRouteInternal: boolean;
  @Field(() => String, { nullable: true }) positiveRouteUrl: string | null;
  @Field(() => String, { nullable: true }) defaultReviewUrl: string | null;
  @Field(() => String, { nullable: true }) googlePlaceId: string | null;
  @Field() newReviewNotifyEmail: boolean;
  @Field() newReviewNotifySlack: boolean;
  @Field(() => String, { nullable: true }) slackWebhookUrl: string | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) createdAt: Date | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) updatedAt: Date | null;
}

@ObjectType()
export class ReputationWidgetEmbedCode {
  @Field() embedCode: string;
  @Field() widgetKey: string;
}

@ObjectType()
export class DeleteReputationPlatformResult {
  @Field(() => Int) deletedId: number;
}

@ObjectType()
export class DeleteReputationWidgetResult {
  @Field(() => Int) deletedId: number;
}
