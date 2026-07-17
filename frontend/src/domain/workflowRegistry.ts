import registry from '../../../workflow-registry.json';

export const WORKFLOW_TRIGGER_TYPES = [
  'contact_added',
  'contact_updated',
  'tag_added',
  'tag_removed',
  'deal_stage_changed',
  'deal_won',
  'deal_lost',
  'deal_reopened',
  'form_submitted',
  'booking_created',
  'booking_cancelled',
  'booking_rescheduled',
  'invoice_paid',
  'contract_signed',
  'manual',
  'scheduled',
] as const;

export const WORKFLOW_STEP_TYPES = [
  'send_email',
  'send_sms',
  'add_tag',
  'remove_tag',
  'wait',
  'create_task',
  'move_deal',
  'webhook',
  'condition',
  'update_contact',
] as const;

export type WorkflowTriggerType = typeof WORKFLOW_TRIGGER_TYPES[number];
export type WorkflowStepType = typeof WORKFLOW_STEP_TYPES[number];

type RegistryEntry<T extends string> = {
  type: T;
  label: string;
};

const assertRegistryMatchesTypes = (
  kind: string,
  runtimeTypes: string[],
  declaredTypes: readonly string[],
) => {
  if (
    runtimeTypes.length !== declaredTypes.length
    || runtimeTypes.some((type, index) => type !== declaredTypes[index])
  ) {
    throw new Error(`Workflow ${kind} registry and frontend types are out of sync`);
  }
};

assertRegistryMatchesTypes(
  'trigger',
  registry.triggers.map(({ type }) => type),
  WORKFLOW_TRIGGER_TYPES,
);
assertRegistryMatchesTypes(
  'step',
  registry.steps.map(({ type }) => type),
  WORKFLOW_STEP_TYPES,
);

export const WORKFLOW_TRIGGER_OPTIONS =
  registry.triggers as RegistryEntry<WorkflowTriggerType>[];
export const WORKFLOW_STEP_OPTIONS =
  registry.steps as RegistryEntry<WorkflowStepType>[];

export const WORKFLOW_TRIGGER_LABELS = Object.fromEntries(
  WORKFLOW_TRIGGER_OPTIONS.map(({ type, label }) => [type, label])
) as Record<WorkflowTriggerType, string>;

export const WORKFLOW_STEP_LABELS = Object.fromEntries(
  WORKFLOW_STEP_OPTIONS.map(({ type, label }) => [type, label])
) as Record<WorkflowStepType, string>;
