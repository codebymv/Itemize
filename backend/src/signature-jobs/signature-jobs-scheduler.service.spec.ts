import { SignatureJobsSchedulerService } from './signature-jobs-scheduler.service';

describe('SignatureJobsSchedulerService', () => {
  const originalEnvironment = process.env;
  const completionResult = {
    claimed: 0,
    completed: 0,
    retry: 0,
    deadLetter: 0,
    stale: 0,
  };
  const deliveryResult = {
    remindersQueued: 0,
    claimed: 0,
    sent: 0,
    retry: 0,
    deadLetter: 0,
    cancelled: 0,
    stale: 0,
  };

  afterEach(() => {
    process.env = originalEnvironment;
    jest.restoreAllMocks();
  });

  it('runs completion before delivery with bounded production options', async () => {
    process.env = {
      ...originalEnvironment,
      SIGNATURE_COMPLETION_BATCH_SIZE: '7',
      SIGNATURE_DELIVERY_BATCH_SIZE: '11',
      SIGNATURE_REMINDER_BATCH_SIZE: '13',
    };
    const calls: string[] = [];
    const completions = {
      run: jest.fn(async () => {
        calls.push('completion');
        return completionResult;
      }),
    };
    const deliveries = {
      run: jest.fn(async () => {
        calls.push('delivery');
        return deliveryResult;
      }),
    };
    const service = new SignatureJobsSchedulerService(
      completions as never,
      deliveries as never,
    );

    await expect(service.runCycle()).resolves.toEqual({
      completion: completionResult,
      delivery: deliveryResult,
    });
    expect(calls).toEqual(['completion', 'delivery']);
    expect(completions.run).toHaveBeenCalledWith(expect.objectContaining({
      batchSize: 7,
    }));
    expect(deliveries.run).toHaveBeenCalledWith(expect.objectContaining({
      batchSize: 11,
      reminderBatchSize: 13,
    }));
  });

  it('does not schedule unless explicitly enabled', () => {
    process.env = {
      ...originalEnvironment,
      SIGNATURE_JOBS_SCHEDULER_ENABLED: 'false',
    };
    const interval = jest.spyOn(global, 'setInterval');
    const service = new SignatureJobsSchedulerService({} as never, {} as never);
    service.onApplicationBootstrap();
    expect(interval).not.toHaveBeenCalled();
  });

  it('starts immediately, prevents overlap, and clears shutdown state', async () => {
    process.env = {
      ...originalEnvironment,
      SIGNATURE_JOBS_SCHEDULER_ENABLED: 'true',
      SIGNATURE_JOBS_SCHEDULER_INTERVAL_MS: '1000',
    };
    let release: (() => void) | undefined;
    const completions = {
      run: jest.fn(() => new Promise(resolve => {
        release = () => resolve(completionResult);
      })),
    };
    const deliveries = { run: jest.fn().mockResolvedValue(deliveryResult) };
    const interval = {
      unref: jest.fn(),
    } as unknown as NodeJS.Timeout;
    jest.spyOn(global, 'setInterval').mockReturnValue(interval);
    const clear = jest.spyOn(global, 'clearInterval').mockImplementation();
    const service = new SignatureJobsSchedulerService(
      completions as never,
      deliveries as never,
    );

    service.onApplicationBootstrap();
    expect(completions.run).toHaveBeenCalledTimes(1);
    service.onApplicationBootstrap();
    expect(completions.run).toHaveBeenCalledTimes(1);
    release?.();
    await Promise.resolve();
    await Promise.resolve();
    service.onApplicationShutdown();
    expect(clear).toHaveBeenCalledWith(interval);
  });
});
