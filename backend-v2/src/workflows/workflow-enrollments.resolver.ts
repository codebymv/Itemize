import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { PageInput } from '../common/pagination';
import { RequestContextService } from '../request-context/request-context.service';
import { EnrollContactInWorkflowInput, WorkflowEnrollmentFilterInput } from './workflow.inputs';
import { WorkflowEnrollment, WorkflowEnrollmentPage } from './workflow.types';
import { WorkflowEnrollmentsService } from './workflow-enrollments.service';

@Resolver(() => WorkflowEnrollment)
export class WorkflowEnrollmentsResolver {
  constructor(private readonly enrollments: WorkflowEnrollmentsService, private readonly context: RequestContextService) {}

  @OrganizationScoped()
  @Query(() => WorkflowEnrollmentPage)
  workflowEnrollments(
    @Args('workflowId', { type: () => Int }) workflowId: number,
    @Args('filter', { nullable: true }) filter?: WorkflowEnrollmentFilterInput,
    @Args('page', { nullable: true }) page?: PageInput,
  ): Promise<WorkflowEnrollmentPage> {
    return this.enrollments.list(this.organizationId(), workflowId, filter, page);
  }

  @CsrfProtected() @OrganizationScoped()
  @Mutation(() => WorkflowEnrollment)
  enrollContactInWorkflow(
    @Args('workflowId', { type: () => Int }) workflowId: number,
    @Args('input') input: EnrollContactInWorkflowInput,
  ): Promise<WorkflowEnrollment> { return this.enrollments.enroll(this.organizationId(), workflowId, input); }

  @CsrfProtected() @OrganizationScoped()
  @Mutation(() => WorkflowEnrollment)
  pauseWorkflowEnrollment(
    @Args('workflowId', { type: () => Int }) workflowId: number,
    @Args('enrollmentId', { type: () => Int }) enrollmentId: number,
  ): Promise<WorkflowEnrollment> { return this.enrollments.pause(this.organizationId(), workflowId, enrollmentId); }

  @CsrfProtected() @OrganizationScoped()
  @Mutation(() => WorkflowEnrollment)
  resumeWorkflowEnrollment(
    @Args('workflowId', { type: () => Int }) workflowId: number,
    @Args('enrollmentId', { type: () => Int }) enrollmentId: number,
  ): Promise<WorkflowEnrollment> { return this.enrollments.resume(this.organizationId(), workflowId, enrollmentId); }

  @CsrfProtected() @OrganizationScoped()
  @Mutation(() => WorkflowEnrollment)
  retryWorkflowEnrollment(
    @Args('workflowId', { type: () => Int }) workflowId: number,
    @Args('enrollmentId', { type: () => Int }) enrollmentId: number,
  ): Promise<WorkflowEnrollment> { return this.enrollments.retry(this.organizationId(), workflowId, enrollmentId); }

  @CsrfProtected() @OrganizationScoped()
  @Mutation(() => WorkflowEnrollment)
  cancelWorkflowEnrollment(
    @Args('workflowId', { type: () => Int }) workflowId: number,
    @Args('enrollmentId', { type: () => Int }) enrollmentId: number,
  ): Promise<WorkflowEnrollment> { return this.enrollments.cancel(this.organizationId(), workflowId, enrollmentId); }

  private organizationId(): number {
    const organization = this.context.current().organization;
    if (!organization) throw new Error('Verified organization context is unavailable');
    return organization.organizationId;
  }
}
