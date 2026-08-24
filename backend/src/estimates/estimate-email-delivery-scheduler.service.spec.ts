import { EstimateEmailDeliverySchedulerService } from './estimate-email-delivery-scheduler.service';

describe('EstimateEmailDeliverySchedulerService', () => {
  const originalEnvironment = process.env;

  afterEach(() => {
    process.env = originalEnvironment;
    jest.restoreAllMocks();
  });

  it('does not schedule unless explicitly enabled', () => {
    process.env = {
      ...originalEnvironment,
      ESTIMATE_EMAIL_DELIVERY_SCHEDULER_ENABLED: 'false',
    };
    const interval = jest.spyOn(global, 'setInterval');
    const service = new EstimateEmailDeliverySchedulerService({} as never);
    service.onApplicationBootstrap();
    expect(interval).not.toHaveBeenCalled();
  });

  it('starts immediately, prevents overlap, and clears its timer', async () => {
    process.env = {
      ...originalEnvironment,
      ESTIMATE_EMAIL_DELIVERY_SCHEDULER_ENABLED: 'true',
      ESTIMATE_EMAIL_DELIVERY_SCHEDULER_INTERVAL_MS: '1000',
    };
    let release: (() => void) | undefined;
    const deliveries = {
      runDue: jest.fn(() => new Promise(resolve => {
        release = () => resolve({ attempted: 0, sent: 0 });
      })),
    };
    const interval = { unref: jest.fn() } as unknown as NodeJS.Timeout;
    jest.spyOn(global, 'setInterval').mockReturnValue(interval);
    const clear = jest.spyOn(global, 'clearInterval').mockImplementation();
    const service = new EstimateEmailDeliverySchedulerService(deliveries as never);

    service.onApplicationBootstrap();
    expect(deliveries.runDue).toHaveBeenCalledTimes(1);
    service.onApplicationBootstrap();
    expect(deliveries.runDue).toHaveBeenCalledTimes(1);
    release?.();
    await Promise.resolve();
    await Promise.resolve();
    service.onApplicationShutdown();
    expect(clear).toHaveBeenCalledWith(interval);
  });

  it('uses a bounded configurable batch size', async () => {
    process.env = {
      ...originalEnvironment,
      ESTIMATE_EMAIL_DELIVERY_BATCH_SIZE: '40',
    };
    const deliveries = {
      runDue: jest.fn().mockResolvedValue({ attempted: 0, sent: 0 }),
    };
    const service = new EstimateEmailDeliverySchedulerService(deliveries as never);
    await expect(service.runCycle()).resolves.toEqual({ attempted: 0, sent: 0 });
    expect(deliveries.runDue).toHaveBeenCalledWith(40);
  });
});
