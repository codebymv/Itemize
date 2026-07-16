const { runWorkflowSideEffectJobs } = require('./workflow-side-effect-jobs');
const {
  runScheduledWorkflowJobs,
  runWorkflowEnrollmentJobs,
  runWorkflowTriggerJobs,
} = require('./workflow-trigger-jobs');

function workflowJobFlags(environment = process.env) {
  return {
    enrollment: environment.WORKFLOW_ENROLLMENT_JOBS_ENABLED === 'true',
    sideEffect: environment.WORKFLOW_SIDE_EFFECT_JOBS_ENABLED !== 'false',
    trigger: environment.WORKFLOW_TRIGGER_JOBS_ENABLED === 'true',
  };
}

function hasEnabledWorkflowJobs(flags) {
  return Object.values(flags).some(Boolean);
}

async function runWorkflowJobCycle(pool, options = {}) {
  const flags = options.flags || workflowJobFlags(options.environment);
  const runners = {
    enrollment: options.runners?.enrollment || runWorkflowEnrollmentJobs,
    scheduled: options.runners?.scheduled || runScheduledWorkflowJobs,
    sideEffect: options.runners?.sideEffect || runWorkflowSideEffectJobs,
    trigger: options.runners?.trigger || runWorkflowTriggerJobs,
  };
  const summary = {
    flags,
    scheduled: null,
    trigger: null,
    enrollment: null,
    sideEffect: null,
  };

  if (flags.trigger) {
    summary.scheduled = await runners.scheduled(pool, options.scheduledOptions);
    summary.trigger = await runners.trigger(pool, options.triggerOptions);
  }
  if (flags.enrollment) {
    summary.enrollment = await runners.enrollment(pool, options.enrollmentOptions);
  }
  if (flags.sideEffect) {
    summary.sideEffect = await runners.sideEffect(pool, options.sideEffectOptions);
  }

  return summary;
}

module.exports = {
  hasEnabledWorkflowJobs,
  runWorkflowJobCycle,
  workflowJobFlags,
};
