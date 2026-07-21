import { Field, InputType, Int } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';

@InputType()
export class WorkflowFilterInput {
  @Field(() => String, { nullable: true }) triggerType?: string;
  @Field(() => Boolean, { nullable: true }) isActive?: boolean;
  @Field(() => String, { nullable: true }) search?: string;
}

@InputType()
export class WorkflowStepInput {
  @Field(() => String) stepType: string;
  @Field(() => GraphQLJSON, { nullable: true }) stepConfig?: Record<string, unknown>;
  @Field(() => GraphQLJSON, { nullable: true }) conditionConfig?: Record<string, unknown> | null;
  @Field(() => Int, { nullable: true }) trueBranchStep?: number | null;
  @Field(() => Int, { nullable: true }) falseBranchStep?: number | null;
}

@InputType()
export class CreateWorkflowInput {
  @Field(() => String) name: string;
  @Field(() => String, { nullable: true }) description?: string | null;
  @Field(() => String) triggerType: string;
  @Field(() => GraphQLJSON, { nullable: true }) triggerConfig?: Record<string, unknown>;
  @Field(() => [WorkflowStepInput], { defaultValue: [] }) steps: WorkflowStepInput[] = [];
}

@InputType()
export class UpdateWorkflowInput {
  @Field(() => String, { nullable: true }) name?: string | null;
  @Field(() => String, { nullable: true }) description?: string | null;
  @Field(() => String, { nullable: true }) triggerType?: string | null;
  @Field(() => GraphQLJSON, { nullable: true }) triggerConfig?: Record<string, unknown> | null;
  @Field(() => [WorkflowStepInput], { nullable: true }) steps?: WorkflowStepInput[] | null;
}
