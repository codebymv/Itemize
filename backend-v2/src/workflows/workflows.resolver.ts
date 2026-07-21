import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { PageInput } from '../common/pagination';
import { RequestContextService } from '../request-context/request-context.service';
import { CreateWorkflowInput, UpdateWorkflowInput, WorkflowFilterInput } from './workflow.inputs';
import { DeleteWorkflowResult, Workflow, WorkflowPage } from './workflow.types';
import { WorkflowsService } from './workflows.service';

@Resolver(() => Workflow)
export class WorkflowsResolver {
  constructor(private readonly workflows: WorkflowsService, private readonly context: RequestContextService) {}

  @OrganizationScoped()
  @Query(() => WorkflowPage, { name: 'workflows' })
  workflowDefinitions(
    @Args('filter', { nullable: true }) filter?: WorkflowFilterInput,
    @Args('page', { nullable: true }) page?: PageInput,
  ): Promise<WorkflowPage> { return this.workflows.list(this.organizationId(), filter, page); }

  @OrganizationScoped()
  @Query(() => Workflow, { name: 'workflow' })
  workflowDefinition(@Args('id', { type: () => Int }) id: number): Promise<Workflow> {
    return this.workflows.detail(this.organizationId(), id);
  }

  @CsrfProtected() @OrganizationScoped()
  @Mutation(() => Workflow)
  createWorkflow(@Args('input') input: CreateWorkflowInput): Promise<Workflow> {
    return this.workflows.create(this.organizationId(), this.userId(), input);
  }

  @CsrfProtected() @OrganizationScoped()
  @Mutation(() => Workflow)
  updateWorkflow(@Args('id', { type: () => Int }) id: number, @Args('input') input: UpdateWorkflowInput): Promise<Workflow> {
    return this.workflows.update(this.organizationId(), id, input);
  }

  @CsrfProtected() @OrganizationScoped()
  @Mutation(() => Workflow)
  duplicateWorkflow(@Args('id', { type: () => Int }) id: number): Promise<Workflow> {
    return this.workflows.duplicate(this.organizationId(), id, this.userId());
  }

  @CsrfProtected() @OrganizationScoped()
  @Mutation(() => Workflow)
  activateWorkflow(@Args('id', { type: () => Int }) id: number): Promise<Workflow> {
    return this.workflows.activate(this.organizationId(), id);
  }

  @CsrfProtected() @OrganizationScoped()
  @Mutation(() => Workflow)
  deactivateWorkflow(@Args('id', { type: () => Int }) id: number): Promise<Workflow> {
    return this.workflows.deactivate(this.organizationId(), id);
  }

  @CsrfProtected() @OrganizationScoped()
  @Mutation(() => DeleteWorkflowResult)
  deleteWorkflow(@Args('id', { type: () => Int }) id: number): Promise<DeleteWorkflowResult> {
    return this.workflows.delete(this.organizationId(), id);
  }

  private organizationId(): number {
    const organization = this.context.current().organization;
    if (!organization) throw new Error('Verified organization context is unavailable');
    return organization.organizationId;
  }
  private userId(): number {
    const identity = this.context.current().identity;
    if (!identity) throw new Error('Verified identity context is unavailable');
    return identity.userId;
  }
}
