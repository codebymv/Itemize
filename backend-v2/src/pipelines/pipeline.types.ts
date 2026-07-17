import {
  Field,
  Float,
  GraphQLISODateTime,
  Int,
  ObjectType,
} from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';

@ObjectType()
export class PipelineStage {
  @Field()
  id: string;

  @Field()
  name: string;

  @Field(() => Int)
  order: number;

  @Field()
  color: string;
}

@ObjectType()
export class PipelineDeal {
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

  @Field(() => Float)
  value: number;

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

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;
}

@ObjectType()
export class Pipeline {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  organizationId: number;

  @Field()
  name: string;

  @Field(() => String, { nullable: true })
  description: string | null;

  @Field(() => [PipelineStage])
  stages: PipelineStage[];

  @Field()
  isDefault: boolean;

  @Field(() => Int, { nullable: true })
  createdById: number | null;

  @Field(() => Int)
  dealCount: number;

  @Field(() => Float)
  totalValue: number;

  @Field(() => [PipelineDeal])
  deals: PipelineDeal[];

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;
}

@ObjectType()
export class DeletePipelineResult {
  @Field(() => Int)
  deletedId: number;
}
