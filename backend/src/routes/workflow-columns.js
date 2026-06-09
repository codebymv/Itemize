const qualify = (columns, alias) => columns.map(column => `${alias}.${column}`).join(', ');

const WORKFLOW_COLUMNS = [
  'id',
  'organization_id',
  'name',
  'description',
  'trigger_type',
  'trigger_config',
  'is_active',
  'stats',
  'created_by',
  'created_at',
  'updated_at'
];

const WORKFLOW_STEP_COLUMNS = [
  'id',
  'workflow_id',
  'step_order',
  'step_type',
  'step_config',
  'condition_config',
  'true_branch_step',
  'false_branch_step',
  'created_at',
  'updated_at'
];

const WORKFLOW_ENROLLMENT_COLUMNS = [
  'id',
  'workflow_id',
  'contact_id',
  'current_step',
  'status',
  'trigger_data',
  'context',
  'error_message',
  'enrolled_at',
  'next_action_at',
  'completed_at'
];

const workflowColumns = (alias) => alias ? qualify(WORKFLOW_COLUMNS, alias) : WORKFLOW_COLUMNS.join(', ');
const workflowStepColumns = (alias) => alias ? qualify(WORKFLOW_STEP_COLUMNS, alias) : WORKFLOW_STEP_COLUMNS.join(', ');
const workflowEnrollmentColumns = (alias) => alias ? qualify(WORKFLOW_ENROLLMENT_COLUMNS, alias) : WORKFLOW_ENROLLMENT_COLUMNS.join(', ');

module.exports = {
  workflowColumns,
  workflowStepColumns,
  workflowEnrollmentColumns
};
