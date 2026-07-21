import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class WorkflowSideEffectFilterInput {
  @Field(() => String, { nullable: true }) status?: string;
  @Field(() => String, { nullable: true }) effectType?: string;
}

@InputType()
export class ReconcileWorkflowSmsSideEffectInput {
  @Field(() => String) action: string;
  @Field(() => String, { nullable: true }) providerId?: string;
}
