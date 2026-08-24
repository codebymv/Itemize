import { Field, InputType, Int } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';

@InputType()
export class CampaignFilterInput {
  @Field(() => String, { nullable: true })
  status?: string;

  @Field(() => String, { nullable: true })
  search?: string;
}

@InputType()
export class CreateCampaignInput {
  @Field(() => String)
  name: string;

  @Field(() => String)
  subject: string;

  @Field(() => String, { nullable: true })
  fromName?: string | null;

  @Field(() => String, { nullable: true })
  fromEmail?: string | null;

  @Field(() => String, { nullable: true })
  replyTo?: string | null;

  @Field(() => Int, { nullable: true })
  templateId?: number | null;

  @Field(() => String, { nullable: true })
  contentHtml?: string | null;

  @Field(() => String, { nullable: true })
  contentText?: string | null;

  @Field(() => String, { defaultValue: 'all' })
  segmentType = 'all';

  @Field(() => Int, { nullable: true })
  segmentId?: number | null;

  @Field(() => GraphQLJSON, { nullable: true })
  segmentFilter?: Record<string, unknown> | null;

  @Field(() => [Int], { defaultValue: [] })
  tagIds: number[] = [];

  @Field(() => [Int], { defaultValue: [] })
  excludedTagIds: number[] = [];
}

@InputType()
export class UpdateCampaignInput {
  @Field(() => String, { nullable: true })
  name?: string | null;

  @Field(() => String, { nullable: true })
  subject?: string | null;

  @Field(() => String, { nullable: true })
  fromName?: string | null;

  @Field(() => String, { nullable: true })
  fromEmail?: string | null;

  @Field(() => String, { nullable: true })
  replyTo?: string | null;

  @Field(() => Int, { nullable: true })
  templateId?: number | null;

  @Field(() => String, { nullable: true })
  contentHtml?: string | null;

  @Field(() => String, { nullable: true })
  contentText?: string | null;

  @Field(() => String, { nullable: true })
  segmentType?: string | null;

  @Field(() => Int, { nullable: true })
  segmentId?: number | null;

  @Field(() => GraphQLJSON, { nullable: true })
  segmentFilter?: Record<string, unknown> | null;

  @Field(() => [Int], { nullable: true })
  tagIds?: number[] | null;

  @Field(() => [Int], { nullable: true })
  excludedTagIds?: number[] | null;
}

@InputType()
export class ScheduleCampaignInput {
  @Field(() => String)
  scheduledAt: string;

  @Field(() => String, { defaultValue: 'UTC' })
  timezone = 'UTC';
}
