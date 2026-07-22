import { Field, InputType, Int } from '@nestjs/graphql';

@InputType()
export class UpsertReputationPlatformInput {
  @Field() platform: string;
  @Field(() => String, { nullable: true }) platformName?: string | null;
  @Field(() => String, { nullable: true }) placeId?: string | null;
  @Field(() => String, { nullable: true }) pageId?: string | null;
  @Field(() => String, { nullable: true }) businessUrl?: string | null;
  @Field(() => String, { nullable: true }) reviewUrl?: string | null;
}

@InputType()
export class CreateReputationWidgetInput {
  @Field() name: string;
  @Field({ nullable: true }) widgetType?: string;
  @Field({ nullable: true }) theme?: string;
  @Field({ nullable: true }) primaryColor?: string;
  @Field({ nullable: true }) backgroundColor?: string;
  @Field({ nullable: true }) textColor?: string;
  @Field(() => Int, { nullable: true }) borderRadius?: number;
  @Field({ nullable: true }) showRatingStars?: boolean;
  @Field({ nullable: true }) showReviewerPhoto?: boolean;
  @Field({ nullable: true }) showReviewDate?: boolean;
  @Field({ nullable: true }) showPlatformIcon?: boolean;
  @Field(() => Int, { nullable: true }) minRating?: number;
  @Field(() => [String], { nullable: true }) platforms?: string[];
  @Field(() => Int, { nullable: true }) maxReviews?: number;
  @Field({ nullable: true }) hideNoTextReviews?: boolean;
  @Field({ nullable: true }) autoRefresh?: boolean;
  @Field(() => Int, { nullable: true }) refreshIntervalHours?: number;
  @Field({ nullable: true }) isActive?: boolean;
}

@InputType()
export class UpdateReputationWidgetInput {
  @Field({ nullable: true }) name?: string;
  @Field({ nullable: true }) widgetType?: string;
  @Field({ nullable: true }) theme?: string;
  @Field({ nullable: true }) primaryColor?: string;
  @Field({ nullable: true }) backgroundColor?: string;
  @Field({ nullable: true }) textColor?: string;
  @Field(() => Int, { nullable: true }) borderRadius?: number;
  @Field({ nullable: true }) showRatingStars?: boolean;
  @Field({ nullable: true }) showReviewerPhoto?: boolean;
  @Field({ nullable: true }) showReviewDate?: boolean;
  @Field({ nullable: true }) showPlatformIcon?: boolean;
  @Field(() => Int, { nullable: true }) minRating?: number;
  @Field(() => [String], { nullable: true }) platforms?: string[];
  @Field(() => Int, { nullable: true }) maxReviews?: number;
  @Field({ nullable: true }) hideNoTextReviews?: boolean;
  @Field({ nullable: true }) autoRefresh?: boolean;
  @Field(() => Int, { nullable: true }) refreshIntervalHours?: number;
  @Field({ nullable: true }) isActive?: boolean;
}

@InputType()
export class UpdateReputationSettingsInput {
  @Field({ nullable: true }) autoRequestEnabled?: boolean;
  @Field(() => Int, { nullable: true }) autoRequestDelayDays?: number;
  @Field({ nullable: true }) autoRequestChannel?: string;
  @Field({ nullable: true }) autoRequestTrigger?: string;
  @Field(() => Int, { nullable: true }) emailTemplateId?: number | null;
  @Field(() => String, { nullable: true }) smsTemplateText?: string | null;
  @Field(() => Int, { nullable: true }) negativeThreshold?: number;
  @Field(() => String, { nullable: true }) negativeAlertEmail?: string | null;
  @Field({ nullable: true }) negativeRouteInternal?: boolean;
  @Field(() => String, { nullable: true }) positiveRouteUrl?: string | null;
  @Field(() => String, { nullable: true }) defaultReviewUrl?: string | null;
  @Field(() => String, { nullable: true }) googlePlaceId?: string | null;
  @Field({ nullable: true }) newReviewNotifyEmail?: boolean;
  @Field({ nullable: true }) newReviewNotifySlack?: boolean;
  @Field(() => String, { nullable: true }) slackWebhookUrl?: string | null;
}
