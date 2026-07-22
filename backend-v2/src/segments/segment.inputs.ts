import { Field, InputType, Int } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';

@InputType()
export class SegmentFilterRuleInput {
  @Field()
  field: string;

  @Field()
  operator: string;

  @Field(() => GraphQLJSON, { nullable: true })
  value?: unknown;

  @Field({ nullable: true })
  customFieldKey?: string;
}

@InputType()
export class SegmentListFilterInput {
  @Field({ nullable: true })
  isActive?: boolean;

  @Field({ nullable: true })
  search?: string;
}

@InputType()
export class CreateSegmentInput {
  @Field()
  name: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field({ nullable: true })
  color?: string;

  @Field({ nullable: true })
  icon?: string;

  @Field({ nullable: true })
  filterType?: string;

  @Field(() => [SegmentFilterRuleInput], { nullable: true })
  filters?: SegmentFilterRuleInput[];

  @Field({ nullable: true })
  segmentType?: string;

  @Field(() => [Int], { nullable: true })
  staticContactIds?: number[];

  @Field({ nullable: true })
  isActive?: boolean;
}

@InputType()
export class UpdateSegmentInput {
  @Field({ nullable: true })
  name?: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field({ nullable: true })
  color?: string;

  @Field({ nullable: true })
  icon?: string;

  @Field({ nullable: true })
  filterType?: string;

  @Field(() => [SegmentFilterRuleInput], { nullable: true })
  filters?: SegmentFilterRuleInput[];

  @Field({ nullable: true })
  segmentType?: string;

  @Field(() => [Int], { nullable: true })
  staticContactIds?: number[];

  @Field({ nullable: true })
  isActive?: boolean;
}

@InputType()
export class PreviewSegmentInput {
  @Field({ nullable: true })
  filterType?: string;

  @Field(() => [SegmentFilterRuleInput])
  filters: SegmentFilterRuleInput[];
}
