import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { PageInput } from '../common/pagination';
import { RequestContextService } from '../request-context/request-context.service';
import { ReconcileWorkflowSmsSideEffectInput, WorkflowSideEffectFilterInput } from './workflow-execution.inputs';
import { WorkflowExecutionService } from './workflow-execution.service';
import { WorkflowExecutionSummary, WorkflowSideEffect, WorkflowSideEffectPage } from './workflow-execution.types';

@Resolver(() => WorkflowSideEffect)
export class WorkflowExecutionResolver {
  constructor(private readonly execution: WorkflowExecutionService, private readonly context: RequestContextService) {}
  @OrganizationScoped() @Query(() => WorkflowExecutionSummary)
  workflowExecutionSummary(@Args('workflowId',{type:()=>Int}) workflowId:number):Promise<WorkflowExecutionSummary> {
    return this.execution.summary(this.organizationId(),workflowId);
  }
  @OrganizationScoped() @Query(() => WorkflowSideEffectPage)
  workflowSideEffects(@Args('workflowId',{type:()=>Int}) workflowId:number,
    @Args('filter',{nullable:true}) filter?:WorkflowSideEffectFilterInput,
    @Args('page',{nullable:true}) page?:PageInput):Promise<WorkflowSideEffectPage> {
    return this.execution.list(this.organizationId(),workflowId,filter,page);
  }
  @CsrfProtected() @OrganizationScoped() @Mutation(() => WorkflowSideEffect)
  retryWorkflowSideEffect(@Args('workflowId',{type:()=>Int}) workflowId:number,
    @Args('sideEffectId',{type:()=>Int}) sideEffectId:number):Promise<WorkflowSideEffect> {
    return this.execution.retry(this.organizationId(),workflowId,sideEffectId);
  }
  @CsrfProtected() @OrganizationScoped() @Mutation(() => WorkflowSideEffect)
  reconcileWorkflowSmsSideEffect(@Args('workflowId',{type:()=>Int}) workflowId:number,
    @Args('sideEffectId',{type:()=>Int}) sideEffectId:number,
    @Args('input') input:ReconcileWorkflowSmsSideEffectInput):Promise<WorkflowSideEffect> {
    return this.execution.reconcile(this.organizationId(),this.userId(),workflowId,sideEffectId,input);
  }
  private organizationId():number { const value=this.context.current().organization?.organizationId; if(!value) throw new Error('Verified organization context is unavailable'); return value; }
  private userId():number { const value=this.context.current().identity?.userId; if(!value) throw new Error('Verified identity is unavailable'); return value; }
}
