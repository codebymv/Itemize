import { Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';
import { PageInput, pageInfo } from '../common/pagination';
import { EnrollContactInWorkflowInput, WorkflowEnrollmentFilterInput } from './workflow.inputs';
import { WorkflowEnrollment, WorkflowEnrollmentPage } from './workflow.types';
import { EnrollmentValue, WorkflowEnrollmentRow, WorkflowEnrollmentsRepository } from './workflow-enrollments.repository';

const STATUSES = new Set(['active', 'completed', 'paused', 'failed', 'cancelled']);

@Injectable()
export class WorkflowEnrollmentsService {
  constructor(private readonly enrollments: WorkflowEnrollmentsRepository) {}

  async list(
    organizationId: number,
    workflowId: number,
    filter: WorkflowEnrollmentFilterInput = {},
    page: PageInput = new PageInput(),
  ): Promise<WorkflowEnrollmentPage> {
    this.id(workflowId, 'workflowId');
    const normalizedPage = this.page(page);
    const status = filter.status === undefined ? undefined : this.status(filter.status);
    const result = await this.enrollments.findPage({
      organizationId, workflowId, ...(status === undefined ? {} : { status }),
      pageSize: normalizedPage.pageSize, offset: normalizedPage.offset,
    });
    if (result.kind === 'not_found') this.notFound('Workflow');
    const total = this.count(result.total, 'workflowEnrollments.total');
    return {
      nodes: result.rows.map((row) => this.map({ row })),
      pageInfo: pageInfo(normalizedPage.page, normalizedPage.pageSize, total),
    };
  }

  async enroll(
    organizationId: number,
    workflowId: number,
    input: EnrollContactInWorkflowInput,
  ): Promise<WorkflowEnrollment> {
    this.id(workflowId, 'workflowId');
    this.id(input.contactId, 'contactId');
    const triggerData = this.record(input.triggerData ?? {}, 'triggerData');
    const outcome = await this.enrollments.enroll(organizationId, workflowId, input.contactId, triggerData);
    if (outcome.kind === 'workflow_not_found') this.notFound('Workflow');
    if (outcome.kind === 'contact_not_found') this.notFound('Contact');
    if (outcome.kind === 'conflict') {
      throw itemizeGraphqlError('Contact is already enrolled in this workflow', 'BAD_USER_INPUT', {
        reason: 'WORKFLOW_ENROLLMENT_CONFLICT',
      });
    }
    return this.map(outcome.value);
  }

  pause(organizationId: number, workflowId: number, enrollmentId: number): Promise<WorkflowEnrollment> {
    return this.transition(organizationId, workflowId, enrollmentId, 'pause');
  }
  resume(organizationId: number, workflowId: number, enrollmentId: number): Promise<WorkflowEnrollment> {
    return this.transition(organizationId, workflowId, enrollmentId, 'resume');
  }
  retry(organizationId: number, workflowId: number, enrollmentId: number): Promise<WorkflowEnrollment> {
    return this.transition(organizationId, workflowId, enrollmentId, 'retry');
  }

  async cancel(organizationId: number, workflowId: number, enrollmentId: number): Promise<WorkflowEnrollment> {
    this.ids(workflowId, enrollmentId);
    const outcome = await this.enrollments.cancel(organizationId, workflowId, enrollmentId);
    if (outcome.kind === 'not_found') this.notFound('Enrollment');
    return this.map(outcome.value);
  }

  private async transition(
    organizationId: number,
    workflowId: number,
    enrollmentId: number,
    action: 'pause' | 'resume' | 'retry',
  ): Promise<WorkflowEnrollment> {
    this.ids(workflowId, enrollmentId);
    const outcome = await this.enrollments.transition(organizationId, workflowId, enrollmentId, action);
    if (outcome.kind === 'not_found') this.notFound('Enrollment');
    if (outcome.kind === 'invalid') {
      const message = action === 'pause'
        ? 'Enrollment is not active'
        : action === 'resume'
          ? 'Enrollment is not manually paused or its workflow is inactive'
          : 'Enrollment is not failed or its workflow is inactive';
      throw itemizeGraphqlError(message, 'BAD_USER_INPUT', {
        reason: `INVALID_WORKFLOW_ENROLLMENT_${action.toUpperCase()}`,
      });
    }
    return this.map(outcome.value);
  }

  private ids(workflowId: number, enrollmentId: number): void {
    this.id(workflowId, 'workflowId'); this.id(enrollmentId, 'enrollmentId');
  }
  private id(value: number, field: string): void {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw itemizeGraphqlError(`${field} must be a positive integer`, 'BAD_USER_INPUT', {
        field, reason: 'INVALID_WORKFLOW_ENROLLMENT_ID',
      });
    }
  }
  private status(value: string): string {
    if (!STATUSES.has(value)) {
      throw itemizeGraphqlError(`Invalid enrollment status: ${value}`, 'BAD_USER_INPUT', {
        field: 'status', reason: 'INVALID_WORKFLOW_ENROLLMENT_STATUS',
      });
    }
    return value;
  }
  private page(input: PageInput) {
    if (!Number.isInteger(input.page) || input.page < 1 || !Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100) {
      throw itemizeGraphqlError('Invalid page input', 'BAD_USER_INPUT', { field: 'page', reason: 'INVALID_PAGE' });
    }
    return { page: input.page, pageSize: input.pageSize, offset: (input.page - 1) * input.pageSize };
  }
  private record(value: unknown, field: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw itemizeGraphqlError(`${field} must be an object`, 'BAD_USER_INPUT', { field, reason: 'INVALID_WORKFLOW_TRIGGER_DATA' });
    }
    return value as Record<string, unknown>;
  }
  private count(value: unknown, field: string): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 2_147_483_647) throw new Error(`Unsafe enrollment count at ${field}`);
    return parsed;
  }
  private notFound(resource: string): never { throw itemizeGraphqlError(`${resource} not found`, 'NOT_FOUND'); }
  private safeRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }
  private readonly map = (value: EnrollmentValue): WorkflowEnrollment => {
    const row: WorkflowEnrollmentRow = value.row;
    return {
      id: Number(row.id), workflowId: Number(row.workflow_id), contactId: Number(row.contact_id),
      currentStep: Number(row.current_step), status: row.status,
      triggerData: this.safeRecord(row.trigger_data), context: this.safeRecord(row.context),
      errorMessage: row.error_message, enrolledAt: new Date(row.enrolled_at),
      nextActionAt: row.next_action_at ? new Date(row.next_action_at) : null,
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
      executionAttemptCount: Number(row.execution_attempt_count), pauseReason: row.pause_reason,
      pausedAt: row.paused_at ? new Date(row.paused_at) : null,
      firstName: row.first_name ?? null, lastName: row.last_name ?? null,
      email: row.email ?? null, company: row.company ?? null,
      affectedSideEffects: value.affectedSideEffects ?? 0,
    };
  };
}
