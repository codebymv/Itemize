import { Field, Float, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';
import { PageInfo } from '../common/pagination';

@ObjectType()
export class SegmentHistory {
  @Field(() => Int) id: number;
  @Field(() => Int) segmentId: number;
  @Field(() => Int) organizationId: number;
  @Field(() => Int) contactCount: number;
  @Field(() => GraphQLISODateTime) calculatedAt: Date;
  @Field(() => Int) contactsAdded: number;
  @Field(() => Int) contactsRemoved: number;
  @Field(() => GraphQLISODateTime) createdAt: Date;
}

@ObjectType()
export class Segment {
  @Field(() => Int) id: number;
  @Field(() => Int) organizationId: number;
  @Field() name: string;
  @Field(() => String, { nullable: true }) description: string | null;
  @Field() color: string;
  @Field() icon: string;
  @Field() filterType: string;
  @Field(() => GraphQLJSON) filters: unknown[];
  @Field() segmentType: string;
  @Field(() => [Int]) staticContactIds: number[];
  @Field(() => Int) contactCount: number;
  @Field(() => GraphQLISODateTime, { nullable: true }) lastCalculatedAt: Date | null;
  @Field() isActive: boolean;
  @Field(() => Int) usedInCampaigns: number;
  @Field(() => Int) usedInAutomations: number;
  @Field(() => Int, { nullable: true }) createdById: number | null;
  @Field(() => String, { nullable: true }) createdByName: string | null;
  @Field(() => GraphQLISODateTime) createdAt: Date;
  @Field(() => GraphQLISODateTime) updatedAt: Date;
  @Field(() => [SegmentHistory]) history: SegmentHistory[];
}

@ObjectType()
export class SegmentPage {
  @Field(() => [Segment]) nodes: Segment[];
  @Field(() => PageInfo) pageInfo: PageInfo;
}

@ObjectType()
export class DeleteSegmentResult {
  @Field(() => Int) deletedId: number;
}

@ObjectType()
export class SegmentPreviewContact {
  @Field(() => Int) id: number;
  @Field(() => String, { nullable: true }) firstName: string | null;
  @Field(() => String, { nullable: true }) lastName: string | null;
  @Field(() => String, { nullable: true }) email: string | null;
  @Field(() => String, { nullable: true }) status: string | null;
}

@ObjectType()
export class SegmentPreview {
  @Field(() => Int) count: number;
  @Field(() => [SegmentPreviewContact]) sample: SegmentPreviewContact[];
}

@ObjectType()
export class SegmentContact {
  @Field(() => Int) id: number;
  @Field(() => String, { nullable: true }) firstName: string | null;
  @Field(() => String, { nullable: true }) lastName: string | null;
  @Field(() => String, { nullable: true }) email: string | null;
  @Field(() => String, { nullable: true }) phone: string | null;
  @Field(() => String, { nullable: true }) status: string | null;
  @Field(() => String, { nullable: true }) source: string | null;
  @Field(() => Int, { nullable: true }) assignedTo: number | null;
  @Field(() => GraphQLJSON) customFields: Record<string, unknown>;
  @Field(() => GraphQLISODateTime) createdAt: Date;
  @Field(() => GraphQLISODateTime) updatedAt: Date;
}

@ObjectType()
export class SegmentContactPage {
  @Field(() => [SegmentContact]) nodes: SegmentContact[];
  @Field(() => PageInfo) pageInfo: PageInfo;
}

@ObjectType()
export class SegmentFilterField {
  @Field() id: string;
  @Field() label: string;
  @Field() type: string;
  @Field(() => [String]) operators: string[];
  @Field(() => [String], { nullable: true }) options: string[] | null;
}

@ObjectType()
export class SegmentFilterTag {
  @Field(() => Int) id: number;
  @Field() name: string;
  @Field() color: string;
}

@ObjectType()
export class SegmentFilterUser {
  @Field(() => Int) id: number;
  @Field() name: string;
}

@ObjectType()
export class SegmentFilterStage {
  @Field() id: string;
  @Field() name: string;
  @Field() color: string;
  @Field(() => Float, { nullable: true }) order: number | null;
}

@ObjectType()
export class SegmentFilterPipeline {
  @Field(() => Int) id: number;
  @Field() name: string;
  @Field(() => [SegmentFilterStage]) stages: SegmentFilterStage[];
}

@ObjectType()
export class SegmentFilterOptions {
  @Field(() => [SegmentFilterField]) fields: SegmentFilterField[];
  @Field(() => [SegmentFilterTag]) tags: SegmentFilterTag[];
  @Field(() => [SegmentFilterUser]) users: SegmentFilterUser[];
  @Field(() => [SegmentFilterPipeline]) pipelines: SegmentFilterPipeline[];
}
