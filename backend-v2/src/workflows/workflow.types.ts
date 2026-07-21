import { Field, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';
import { PageInfo } from '../common/pagination';

@ObjectType()
export class WorkflowStep {
  @Field(() => Int) id: number;
  @Field(() => Int) workflowId: number;
  @Field(() => Int) stepOrder: number;
  @Field(() => String) stepType: string;
  @Field(() => GraphQLJSON) stepConfig: Record<string, unknown>;
  @Field(() => GraphQLJSON, { nullable: true }) conditionConfig: Record<string, unknown> | null;
  @Field(() => Int, { nullable: true }) trueBranchStep: number | null;
  @Field(() => Int, { nullable: true }) falseBranchStep: number | null;
  @Field(() => GraphQLISODateTime) createdAt: Date;
  @Field(() => GraphQLISODateTime) updatedAt: Date;
}

@ObjectType()
export class WorkflowEnrollmentStats {
  @Field(() => Int) activeCount: number;
  @Field(() => Int) completedCount: number;
  @Field(() => Int) failedCount: number;
  @Field(() => Int) totalCount: number;
}

@ObjectType()
export class Workflow {
  @Field(() => Int) id: number;
  @Field(() => Int) organizationId: number;
  @Field(() => String) name: string;
  @Field(() => String, { nullable: true }) description: string | null;
  @Field(() => String) triggerType: string;
  @Field(() => GraphQLJSON) triggerConfig: Record<string, unknown>;
  @Field(() => Int, { nullable: true }) scheduledContactId: number | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) nextTriggerAt: Date | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) lastTriggeredAt: Date | null;
  @Field(() => Boolean) isActive: boolean;
  @Field(() => GraphQLJSON) stats: Record<string, unknown>;
  @Field(() => Int, { nullable: true }) createdById: number | null;
  @Field(() => String, { nullable: true }) createdByName: string | null;
  @Field(() => GraphQLISODateTime) createdAt: Date;
  @Field(() => GraphQLISODateTime) updatedAt: Date;
  @Field(() => [WorkflowStep]) steps: WorkflowStep[];
  @Field(() => Int) stepCount: number;
  @Field(() => Int) activeEnrollments: number;
  @Field(() => WorkflowEnrollmentStats) enrollmentStats: WorkflowEnrollmentStats;
  @Field(() => Int) affectedEnrollments: number;
}

@ObjectType()
export class WorkflowPage {
  @Field(() => [Workflow]) nodes: Workflow[];
  @Field(() => PageInfo) pageInfo: PageInfo;
}

@ObjectType()
export class DeleteWorkflowResult {
  @Field(() => Int) deletedId: number;
  @Field(() => Boolean) success: boolean;
}
