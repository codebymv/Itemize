// Keep a deployable copy inside the backend package. Railway builds this service
// with backend/ as its Docker context, so monorepo-root files are unavailable in
// the runtime image. The registry test enforces byte-for-data parity with the
// root registry consumed by the frontend.
const registry = require('../../workflow-registry.json');

const assertRegistryName = (value, kind) => {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) {
    throw new Error(`Invalid ${kind} in workflow registry: ${value}`);
  }
  return value;
};

const WORKFLOW_TRIGGER_TYPES = Object.freeze(
  registry.triggers.map(({ type }) => assertRegistryName(type, 'trigger type'))
);
const WORKFLOW_STEP_TYPES = Object.freeze(
  registry.steps.map(({ type }) => assertRegistryName(type, 'step type'))
);
const WORKFLOW_TRIGGER_ALIASES = Object.freeze(
  Object.fromEntries(
    registry.triggers.flatMap(({ type, aliases = [] }) =>
      aliases.map(alias => [
        assertRegistryName(alias, 'trigger alias'),
        assertRegistryName(type, 'trigger type'),
      ])
    )
  )
);
const WORKFLOW_TRIGGERS = Object.freeze(
  Object.fromEntries(
    WORKFLOW_TRIGGER_TYPES.map(type => [type.toUpperCase(), type])
  )
);

function normalizeWorkflowTriggerType(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (WORKFLOW_TRIGGER_TYPES.includes(normalized)) return normalized;
  return WORKFLOW_TRIGGER_ALIASES[normalized] || null;
}

function isWorkflowStepType(value) {
  return typeof value === 'string' && WORKFLOW_STEP_TYPES.includes(value);
}

const workflowTriggerSqlList = WORKFLOW_TRIGGER_TYPES
  .map(type => `'${type}'`)
  .join(', ');

module.exports = {
  WORKFLOW_STEP_TYPES,
  WORKFLOW_TRIGGER_ALIASES,
  WORKFLOW_TRIGGER_TYPES,
  WORKFLOW_TRIGGERS,
  isWorkflowStepType,
  normalizeWorkflowTriggerType,
  workflowTriggerSqlList,
};
