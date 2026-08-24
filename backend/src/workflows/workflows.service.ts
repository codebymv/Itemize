import { Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';
import { PageInput, pageInfo } from '../common/pagination';
import { CreateWorkflowInput, UpdateWorkflowInput, WorkflowFilterInput, WorkflowStepInput } from './workflow.inputs';
import { isWorkflowStep, normalizeWorkflowTrigger, WORKFLOW_STEP_TYPES, WORKFLOW_TRIGGER_TYPES } from './workflow.registry';
import { DeleteWorkflowResult, Workflow, WorkflowPage, WorkflowStep } from './workflow.types';
import {
  ScheduleValue, WorkflowRow, WorkflowsRepository, WorkflowStepRow, WorkflowStepValue, WorkflowValue,
} from './workflows.repository';

@Injectable()
export class WorkflowsService {
  constructor(private readonly workflows: WorkflowsRepository) {}

  async list(
    organizationId: number,
    filter: WorkflowFilterInput = {},
    page: PageInput = new PageInput(),
  ): Promise<WorkflowPage> {
    const normalizedPage = this.page(page);
    const triggerType = filter.triggerType === undefined ? undefined : this.trigger(filter.triggerType);
    const result = await this.workflows.findPage({
      organizationId,
      ...(triggerType === undefined ? {} : { triggerType }),
      ...(filter.isActive === undefined ? {} : { isActive: filter.isActive }),
      ...(filter.search === undefined ? {} : { searchPattern: this.search(filter.search) }),
      pageSize: normalizedPage.pageSize,
      offset: normalizedPage.offset,
    });
    const total = this.count(result.total, 'workflows.total');
    return {
      nodes: result.rows.map((row) => this.map({ workflow: row, steps: [] })),
      pageInfo: pageInfo(normalizedPage.page, normalizedPage.pageSize, total),
    };
  }

  async detail(organizationId: number, id: number): Promise<Workflow> {
    this.id(id);
    const value = await this.workflows.findById(organizationId, id);
    if (!value) this.notFound();
    return this.map(value);
  }

  async create(organizationId: number, userId: number, input: CreateWorkflowInput): Promise<Workflow> {
    const triggerType = this.trigger(input.triggerType);
    const triggerConfig = this.record(input.triggerConfig ?? {}, 'triggerConfig');
    const outcome = await this.workflows.create(organizationId, userId, {
      name: this.name(input.name),
      description: this.description(input.description),
      triggerType,
      triggerConfig,
      schedule: this.schedule(triggerType, triggerConfig),
      steps: this.steps(input.steps ?? []),
    });
    if (outcome.kind === 'limit') this.limit(outcome.limit);
    if (outcome.kind === 'contact') this.invalidScheduledContact();
    return this.map(outcome.value);
  }

  async update(organizationId: number, id: number, input: UpdateWorkflowInput): Promise<Workflow> {
    this.id(id);
    if (input.name === null || input.triggerType === null || input.triggerConfig === null || input.steps === null) {
      throw itemizeGraphqlError('name, triggerType, triggerConfig, and steps cannot be null', 'BAD_USER_INPUT', {
        reason: 'NULL_WORKFLOW_FIELD',
      });
    }
    const outcome = await this.workflows.update(organizationId, id, {
      ...(input.name === undefined ? {} : { name: this.name(input.name) }),
      ...(Object.prototype.hasOwnProperty.call(input, 'description')
        ? { description: this.description(input.description) } : {}),
      ...(input.triggerType === undefined ? {} : { triggerType: this.trigger(input.triggerType) }),
      ...(input.triggerConfig === undefined ? {} : { triggerConfig: this.record(input.triggerConfig, 'triggerConfig') }),
      ...(input.steps === undefined ? {} : { steps: this.steps(input.steps) }),
      scheduleFor: (triggerType, triggerConfig) => this.schedule(triggerType, triggerConfig),
    });
    if (outcome.kind === 'not_found') this.notFound();
    if (outcome.kind === 'contact') this.invalidScheduledContact();
    return this.map(outcome.value);
  }

  async duplicate(organizationId: number, id: number, userId: number): Promise<Workflow> {
    this.id(id);
    const outcome = await this.workflows.duplicate(organizationId, id, userId);
    if (outcome.kind === 'not_found') this.notFound();
    if (outcome.kind === 'limit') this.limit(outcome.limit);
    return this.map(outcome.value);
  }

  async activate(organizationId: number, id: number): Promise<Workflow> {
    return this.lifecycle(organizationId, id, true);
  }

  async deactivate(organizationId: number, id: number): Promise<Workflow> {
    return this.lifecycle(organizationId, id, false);
  }

  async delete(organizationId: number, id: number): Promise<DeleteWorkflowResult> {
    this.id(id);
    if (!(await this.workflows.delete(organizationId, id))) this.notFound();
    return { deletedId: id, success: true };
  }

  private async lifecycle(organizationId: number, id: number, active: boolean): Promise<Workflow> {
    this.id(id);
    const outcome = await this.workflows.setActive(organizationId, id, active);
    if (outcome.kind === 'not_found') this.notFound();
    if (outcome.kind === 'no_steps') {
      throw itemizeGraphqlError('Workflow must have at least one step before activation', 'BAD_USER_INPUT', {
        reason: 'WORKFLOW_HAS_NO_STEPS',
      });
    }
    if (outcome.kind === 'schedule') {
      throw itemizeGraphqlError('Scheduled workflow requires a tenant-owned contact and scheduled timestamp', 'BAD_USER_INPUT', {
        reason: 'INVALID_WORKFLOW_SCHEDULE',
      });
    }
    return this.map(outcome.value);
  }

  private trigger(value: string): string {
    const normalized = normalizeWorkflowTrigger(value);
    if (!normalized) {
      throw itemizeGraphqlError(`Invalid triggerType. Must be one of: ${WORKFLOW_TRIGGER_TYPES.join(', ')}`, 'BAD_USER_INPUT', {
        field: 'triggerType', reason: 'INVALID_WORKFLOW_TRIGGER',
      });
    }
    return normalized;
  }

  private steps(values: WorkflowStepInput[]): WorkflowStepValue[] {
    if (!Array.isArray(values)) {
      throw itemizeGraphqlError('steps must be an array', 'BAD_USER_INPUT', { field: 'steps', reason: 'INVALID_WORKFLOW_STEPS' });
    }
    return values.map((step, index) => {
      if (!step || !isWorkflowStep(step.stepType)) {
        throw itemizeGraphqlError(`Invalid stepType. Must be one of: ${WORKFLOW_STEP_TYPES.join(', ')}`, 'BAD_USER_INPUT', {
          field: `steps.${index}.stepType`, reason: 'INVALID_WORKFLOW_STEP_TYPE',
        });
      }
      const branch = (value: number | null | undefined, field: string): number | null => {
        if (value === undefined || value === null) return null;
        if (!Number.isInteger(value) || value <= index + 1 || value > values.length) {
          throw itemizeGraphqlError(`${field} must point to a later step within this workflow`, 'BAD_USER_INPUT', {
            field: `steps.${index}.${field}`, reason: 'INVALID_WORKFLOW_BRANCH',
          });
        }
        return value;
      };
      const trueBranchStep = branch(step.trueBranchStep, 'trueBranchStep');
      const falseBranchStep = branch(step.falseBranchStep, 'falseBranchStep');
      if (step.stepType !== 'condition' && (trueBranchStep !== null || falseBranchStep !== null)) {
        throw itemizeGraphqlError('Only condition steps may define branches', 'BAD_USER_INPUT', {
          field: `steps.${index}`, reason: 'INVALID_WORKFLOW_BRANCH',
        });
      }
      return {
        stepType: step.stepType,
        stepConfig: this.record(step.stepConfig ?? {}, `steps.${index}.stepConfig`),
        conditionConfig: step.conditionConfig == null ? null : this.record(step.conditionConfig, `steps.${index}.conditionConfig`),
        trueBranchStep,
        falseBranchStep,
      };
    });
  }

  private schedule(triggerType: string, config: Record<string, unknown>): ScheduleValue {
    if (triggerType !== 'scheduled') return { contactId: null, nextTriggerAt: null };
    const contactId = Number(config.contact_id);
    if (!Number.isSafeInteger(contactId) || contactId < 1) {
      throw itemizeGraphqlError('Scheduled workflows require a positive contact_id', 'BAD_USER_INPUT', {
        field: 'triggerConfig.contact_id', reason: 'INVALID_WORKFLOW_SCHEDULE',
      });
    }
    const nextTriggerAt = new Date(String(config.scheduled_at ?? ''));
    if (!config.scheduled_at || Number.isNaN(nextTriggerAt.getTime())) {
      throw itemizeGraphqlError('Scheduled workflows require a valid scheduled_at timestamp', 'BAD_USER_INPUT', {
        field: 'triggerConfig.scheduled_at', reason: 'INVALID_WORKFLOW_SCHEDULE',
      });
    }
    return { contactId, nextTriggerAt };
  }

  private name(value: string): string {
    if (typeof value !== 'string' || value.trim().length === 0 || value.length > 255) {
      throw itemizeGraphqlError('name is required and must not exceed 255 characters', 'BAD_USER_INPUT', {
        field: 'name', reason: 'INVALID_WORKFLOW_NAME',
      });
    }
    return value.trim();
  }

  private description(value: string | null | undefined): string | null {
    if (value == null || value.length === 0) return null;
    if (typeof value !== 'string' || value.length > 100_000) {
      throw itemizeGraphqlError('description must not exceed 100000 characters', 'BAD_USER_INPUT', {
        field: 'description', reason: 'INVALID_WORKFLOW_DESCRIPTION',
      });
    }
    return value;
  }

  private record(value: unknown, field: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw itemizeGraphqlError(`${field} must be an object`, 'BAD_USER_INPUT', { field, reason: 'INVALID_WORKFLOW_CONFIG' });
    }
    return value as Record<string, unknown>;
  }

  private search(value: string): string {
    const normalized = value.trim();
    if (normalized.length < 1 || normalized.length > 100) {
      throw itemizeGraphqlError('search must be between 1 and 100 characters', 'BAD_USER_INPUT', {
        field: 'search', reason: 'INVALID_WORKFLOW_SEARCH',
      });
    }
    return `%${normalized.replace(/[\\%_]/g, '\\$&')}%`;
  }

  private page(input: PageInput) {
    if (!Number.isInteger(input.page) || input.page < 1 || !Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100) {
      throw itemizeGraphqlError('Invalid page input', 'BAD_USER_INPUT', { field: 'page', reason: 'INVALID_PAGE' });
    }
    return { page: input.page, pageSize: input.pageSize, offset: (input.page - 1) * input.pageSize };
  }

  private id(value: number): void {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw itemizeGraphqlError('id must be a positive integer', 'BAD_USER_INPUT', { field: 'id', reason: 'INVALID_WORKFLOW_ID' });
    }
  }

  private count(value: unknown, field: string): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 2_147_483_647) throw new Error(`Unsafe workflow count at ${field}`);
    return parsed;
  }

  private limit(limit: { current: number; limit: number; plan: string }): never {
    throw itemizeGraphqlError(
      `Workflow limit reached. Your ${limit.plan} plan allows ${limit.limit} workflow(s). Please upgrade to create more.`,
      'FORBIDDEN', { reason: 'PLAN_LIMIT_REACHED', ...limit },
    );
  }

  private invalidScheduledContact(): never {
    throw itemizeGraphqlError('scheduled contact_id must belong to the active organization', 'BAD_USER_INPUT', {
      field: 'triggerConfig.contact_id', reason: 'INVALID_WORKFLOW_SCHEDULE',
    });
  }

  private notFound(): never { throw itemizeGraphqlError('Workflow not found', 'NOT_FOUND'); }

  private readonly map = (value: WorkflowValue): Workflow => {
    const row = value.workflow;
    return {
      id: Number(row.id), organizationId: Number(row.organization_id), name: row.name,
      description: row.description, triggerType: row.trigger_type,
      triggerConfig: this.safeRecord(row.trigger_config),
      scheduledContactId: row.scheduled_contact_id === null ? null : Number(row.scheduled_contact_id),
      nextTriggerAt: row.next_trigger_at ? new Date(row.next_trigger_at) : null,
      lastTriggeredAt: row.last_triggered_at ? new Date(row.last_triggered_at) : null,
      isActive: row.is_active, stats: this.safeRecord(row.stats),
      createdById: row.created_by === null ? null : Number(row.created_by),
      createdByName: row.created_by_name ?? null,
      createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at),
      steps: value.steps.map(this.mapStep),
      stepCount: this.count(row.step_count, 'workflow.stepCount'),
      activeEnrollments: this.count(row.active_enrollments, 'workflow.activeEnrollments'),
      enrollmentStats: {
        activeCount: this.count(row.active_count, 'workflow.enrollmentStats.active'),
        completedCount: this.count(row.completed_count, 'workflow.enrollmentStats.completed'),
        failedCount: this.count(row.failed_count, 'workflow.enrollmentStats.failed'),
        totalCount: this.count(row.total_count, 'workflow.enrollmentStats.total'),
      },
      affectedEnrollments: value.affectedEnrollments ?? 0,
    };
  };

  private readonly mapStep = (row: WorkflowStepRow): WorkflowStep => ({
    id: Number(row.id), workflowId: Number(row.workflow_id), stepOrder: Number(row.step_order),
    stepType: row.step_type, stepConfig: this.safeRecord(row.step_config),
    conditionConfig: row.condition_config == null ? null : this.safeRecord(row.condition_config),
    trueBranchStep: row.true_branch_step === null ? null : Number(row.true_branch_step),
    falseBranchStep: row.false_branch_step === null ? null : Number(row.false_branch_step),
    createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at),
  });

  private safeRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }
}
