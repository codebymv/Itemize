import { Logger } from '@nestjs/common';
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
  it('drains the active cycle before database shutdown and refuses new ticks', async () => {
    jest.useFakeTimers();
    process.env = { ...originalEnvironment, WORKFLOW_NEST_SCHEDULER_ENABLED: 'true' };
    const service = new WorkflowJobsSchedulerService({} as never, {} as never, {} as never);
    let finish!: (value: never) => void;
    const run = jest.spyOn(service, 'runCycle').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    service.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(120_000);
    expect(run).toHaveBeenCalledTimes(1);
    let stopped = false;
    const shutdown = service.beforeApplicationShutdown().then(() => { stopped = true; });
    await Promise.resolve();
    expect(stopped).toBe(false);
    finish({ scheduled: { claimed: 0 }, trigger: { claimed: 0 }, enrollment: { claimed: 0 }, sideEffect: { claimed: 0 } } as never);
    await shutdown;
    expect(stopped).toBe(true);
    await jest.advanceTimersByTimeAsync(120_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('does not leak provider exceptions and recovers on the next cycle', async () => {
    jest.useFakeTimers();
    process.env = { ...originalEnvironment, WORKFLOW_NEST_SCHEDULER_ENABLED: 'true' };
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const service = new WorkflowJobsSchedulerService({} as never, {} as never, {} as never);
    const run = jest.spyOn(service, 'runCycle').mockRejectedValue(new Error('secret provider URL and recipient@example.com'));
    service.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(2);
    expect(logger).toHaveBeenCalledWith('Workflow job cycle failed; inspect queue status');
    expect(JSON.stringify(logger.mock.calls)).not.toContain('recipient@example.com');
    await service.beforeApplicationShutdown();
  });

});
