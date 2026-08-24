import { WorkflowEnrollmentJobsService } from './workflow-enrollment-jobs.service';
import { WorkflowJobsSchedulerService } from './workflow-jobs-scheduler.service';
import { WorkflowSideEffectJobsService } from './workflow-side-effect-jobs.service';
import { WorkflowTriggerJobsService } from './workflow-trigger-jobs.service';

describe('WorkflowJobsSchedulerService', () => {
  const originalEnvironment = process.env;

  afterEach(() => {
    process.env = originalEnvironment;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('runs all four phases in authoritative order', async () => {
    const calls: string[] = [];
    const triggers = {
      runScheduled: jest.fn(async () => {
        calls.push('scheduled');
        return { claimed: 1, queued: 1 };
      }),
      runTriggers: jest.fn(async () => {
        calls.push('trigger');
        return { claimed: 1, completed: 1, deadLetter: 0, enrolled: 1, retry: 0, stale: 0 };
      }),
    } as unknown as WorkflowTriggerJobsService;
    const enrollments = {
      run: jest.fn(async () => {
        calls.push('enrollment');
        return { claimed: 1, completed: 1, failed: 0, skipped: 0, waiting: 0 };
      }),
    } as unknown as WorkflowEnrollmentJobsService;
    const sideEffects = {
      run: jest.fn(async () => {
        calls.push('sideEffect');
        return {
          claimed: 1, sent: 1, retry: 0, deadLetter: 0, cancelled: 0,
          reconciliationRequired: 0, stale: 0,
        };
      }),
    } as unknown as WorkflowSideEffectJobsService;

    const result = await new WorkflowJobsSchedulerService(triggers, enrollments, sideEffects).runCycle();

    expect(calls).toEqual(['scheduled', 'trigger', 'enrollment', 'sideEffect']);
    expect(result.sideEffect.sent).toBe(1);
  });

  it('stays inert unless explicitly enabled', () => {
    process.env = { ...originalEnvironment, WORKFLOW_NEST_SCHEDULER_ENABLED: 'false' };
    const timer = jest.spyOn(global, 'setInterval');
    const service = new WorkflowJobsSchedulerService({} as never, {} as never, {} as never);

    service.onApplicationBootstrap();

    expect(timer).not.toHaveBeenCalled();
  });
});
