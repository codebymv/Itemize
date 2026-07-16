const registryFile = require('../../../../workflow-registry.json');
const bundledRegistryFile = require('../../../workflow-registry.json');
const {
  WORKFLOW_STEP_TYPES,
  WORKFLOW_TRIGGER_TYPES,
  normalizeWorkflowTriggerType,
} = require('../../domain/workflowRegistry');

describe('workflow registry', () => {
  test('keeps the deployable backend registry synchronized with the monorepo registry', () => {
    expect(bundledRegistryFile).toEqual(registryFile);
  });

  test('exports the shared trigger and step vocabularies', () => {
    expect(WORKFLOW_TRIGGER_TYPES).toEqual(
      registryFile.triggers.map(({ type }) => type)
    );
    expect(WORKFLOW_STEP_TYPES).toEqual(
      registryFile.steps.map(({ type }) => type)
    );
  });

  test('normalizes compatibility aliases without storing them as canonical values', () => {
    expect(normalizeWorkflowTriggerType('contact_created')).toBe('contact_added');
    expect(normalizeWorkflowTriggerType('deal_status_changed')).toBe('deal_stage_changed');
    expect(WORKFLOW_TRIGGER_TYPES).not.toContain('contact_created');
    expect(normalizeWorkflowTriggerType('invented_event')).toBeNull();
  });
});
