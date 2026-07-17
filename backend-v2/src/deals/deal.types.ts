import { Field, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';
import { PageInfo } from '../common/pagination';

@ObjectType()
export class Deal {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  organizationId: number;

  @Field(() => Int)
  pipelineId: number;

  @Field(() => Int, { nullable: true })
  contactId: number | null;

  @Field()
  stageId: string;

  @Field()
  title: string;

  @Field()
  value: string;

  @Field()
  currency: string;

  @Field(() => Int)
  probability: number;

  @Field(() => String, { nullable: true })
  expectedCloseDate: string | null;

  @Field(() => Int, { nullable: true })
  assignedToId: number | null;

  @Field(() => String, { nullable: true })
  assignedToName: string | null;

  @Field(() => Int, { nullable: true })
  createdById: number | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  wonAt: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  lostAt: Date | null;

  @Field(() => String, { nullable: true })
  lostReason: string | null;

  @Field(() => GraphQLJSON)
  customFields: Record<string, unknown>;

  @Field(() => [String])
  tags: string[];

  @Field(() => String, { nullable: true })
  contactFirstName: string | null;

  @Field(() => String, { nullable: true })
  contactLastName: string | null;

  @Field(() => String, { nullable: true })
  contactEmail: string | null;

  @Field(() => String, { nullable: true })
  contactCompany: string | null;

  @Field(() => String, { nullable: true })
  pipelineName: string | null;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;
}

@ObjectType()
export class DealPage {
  @Field(() => [Deal])
  nodes: Deal[];

  @Field(() => PageInfo)
  pageInfo: PageInfo;
}

@ObjectType()
export class DeleteDealResult {
  @Field(() => Int)
  deletedId: number;
}
