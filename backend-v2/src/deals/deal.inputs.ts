import { Field, InputType, Int } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';
import {
  DealSortDirection,
  DealSortField,
  DealStatus,
} from './deal.enums';

@InputType()
export class DealFilterInput {
  @Field(() => Int, { nullable: true })
  pipelineId?: number;

  @Field({ nullable: true })
  stageId?: string;

  @Field(() => Int, { nullable: true })
  contactId?: number;

  @Field(() => Int, { nullable: true })
  assignedToId?: number;

  @Field(() => DealStatus, { nullable: true })
  status?: DealStatus;
}

@InputType()
export class DealSortInput {
  @Field(() => DealSortField, { defaultValue: DealSortField.CREATED_AT })
  field = DealSortField.CREATED_AT;

  @Field(() => DealSortDirection, { defaultValue: DealSortDirection.DESC })
  direction = DealSortDirection.DESC;
}

@InputType()
export class CreateDealInput {
  @Field(() => Int)
  pipelineId: number;

  @Field(() => Int, { nullable: true })
  contactId?: number;

  @Field({ nullable: true })
  stageId?: string;

  @Field()
  title: string;

  @Field({ nullable: true })
  value?: string;

  @Field({ nullable: true })
  currency?: string;

  @Field(() => Int, { nullable: true })
  probability?: number;

  @Field({ nullable: true })
  expectedCloseDate?: string;

  @Field(() => Int, { nullable: true })
  assignedToId?: number;

  @Field(() => GraphQLJSON, { nullable: true })
  customFields?: Record<string, unknown>;

  @Field(() => [String], { nullable: true })
  tags?: string[];
}

@InputType()
export class UpdateDealInput {
  @Field(() => Int, { nullable: true })
  pipelineId?: number | null;

  @Field(() => Int, { nullable: true })
  contactId?: number | null;

  @Field(() => String, { nullable: true })
  stageId?: string | null;

  @Field(() => String, { nullable: true })
  title?: string | null;

  @Field(() => String, { nullable: true })
  value?: string | null;

  @Field(() => String, { nullable: true })
  currency?: string | null;

  @Field(() => Int, { nullable: true })
  probability?: number | null;

  @Field(() => String, { nullable: true })
  expectedCloseDate?: string | null;

  @Field(() => Int, { nullable: true })
  assignedToId?: number | null;

  @Field(() => GraphQLJSON, { nullable: true })
  customFields?: Record<string, unknown> | null;

  @Field(() => [String], { nullable: true })
  tags?: string[] | null;
}
