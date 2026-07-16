const {
  hasEnabledWorkflowJobs,
  runWorkflowJobCycle,
  workflowJobFlags,
} = require('../../jobs/workflow-rollout-jobs');

describe('workflow rollout job cycle', () => {
  test('keeps trigger and enrollment opt-in while side effects default on', () => {
    const flags = workflowJobFlags({});
    expect(flags).toEqual({
      enrollment: false,
      sideEffect: true,
      trigger: false,
    });
    expect(hasEnabledWorkflowJobs(flags)).toBe(true);
    expect(workflowJobFlags({
      WORKFLOW_ENROLLMENT_JOBS_ENABLED: 'true',
      WORKFLOW_SIDE_EFFECT_JOBS_ENABLED: 'false',
      WORKFLOW_TRIGGER_JOBS_ENABLED: 'true',
    })).toEqual({
      enrollment: true,
      sideEffect: false,
      trigger: true,
    });
  });

  test('runs enabled phases in production order', async () => {
    const calls = [];
    const runner = name => jest.fn(async () => {
      calls.push(name);
      return { name };
    });
    const runners = {
      enrollment: runner('enrollment'),
      scheduled: runner('scheduled'),
      sideEffect: runner('sideEffect'),
      trigger: runner('trigger'),
    };

    const summary = await runWorkflowJobCycle({}, {
      environment: {
        WORKFLOW_ENROLLMENT_JOBS_ENABLED: 'true',
        WORKFLOW_SIDE_EFFECT_JOBS_ENABLED: 'true',
        WORKFLOW_TRIGGER_JOBS_ENABLED: 'true',
      },
      runners,
    });

    expect(calls).toEqual(['scheduled', 'trigger', 'enrollment', 'sideEffect']);
    expect(summary).toEqual(expect.objectContaining({
      scheduled: { name: 'scheduled' },
      trigger: { name: 'trigger' },
      enrollment: { name: 'enrollment' },
      sideEffect: { name: 'sideEffect' },
    }));
  });

  test('does not invoke disabled phases', async () => {
    const runners = {
      enrollment: jest.fn(),
      scheduled: jest.fn(),
      sideEffect: jest.fn(async () => ({ claimed: 0 })),
      trigger: jest.fn(),
    };

    const summary = await runWorkflowJobCycle({}, {
      environment: {
        WORKFLOW_ENROLLMENT_JOBS_ENABLED: 'false',
        WORKFLOW_SIDE_EFFECT_JOBS_ENABLED: 'true',
        WORKFLOW_TRIGGER_JOBS_ENABLED: 'false',
      },
      runners,
    });

    expect(summary).toMatchObject({
      scheduled: null,
      trigger: null,
      enrollment: null,
      sideEffect: { claimed: 0 },
    });
    expect(runners.sideEffect).toHaveBeenCalledTimes(1);
    expect(runners.scheduled).not.toHaveBeenCalled();
    expect(runners.trigger).not.toHaveBeenCalled();
    expect(runners.enrollment).not.toHaveBeenCalled();
  });
});
