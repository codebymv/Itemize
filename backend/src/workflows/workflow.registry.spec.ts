import {
  isWorkflowStep,
  normalizeWorkflowTrigger,
  WORKFLOW_STEP_TYPES,
  WORKFLOW_TRIGGER_TYPES,
} from './workflow.registry';

const registry = require('../../../workflow-registry.json') as {
  triggers: Array<{ type: string }>;
  steps: Array<{ type: string }>;
};

describe('workflow registry', () => {
  it('stays in exact parity with the canonical repository registry', () => {
    expect(WORKFLOW_TRIGGER_TYPES).toEqual(registry.triggers.map(({ type }) => type));
    expect(WORKFLOW_STEP_TYPES).toEqual(registry.steps.map(({ type }) => type));
  });

  it('normalizes canonical aliases and rejects unsupported values', () => {
    expect(normalizeWorkflowTrigger(' CONTACT_CREATED ')).toBe('contact_added');
    expect(normalizeWorkflowTrigger('deal_status_changed')).toBe('deal_stage_changed');
    expect(normalizeWorkflowTrigger('invented')).toBeNull();
    expect(isWorkflowStep('send_email')).toBe(true);
    expect(isWorkflowStep('run_code')).toBe(false);
  });
});
