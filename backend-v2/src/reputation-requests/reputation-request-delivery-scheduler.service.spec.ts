import { ReputationRequestDeliverySchedulerService } from './reputation-request-delivery-scheduler.service';
import { ReputationRequestDeliveryService } from './reputation-request-delivery.service';

describe('ReputationRequestDeliverySchedulerService', () => {
  const original = process.env;

  afterEach(() => {
    process.env = original;
    jest.restoreAllMocks();
  });

  it('runs one bounded cycle through the durable delivery service', async () => {
    process.env = { ...original, REPUTATION_REQUEST_DELIVERY_BATCH_SIZE: '750' };
    const deliveries = {
      runDue: jest.fn().mockResolvedValue({ attempted: 2, sent: 1 }),
    } as unknown as jest.Mocked<ReputationRequestDeliveryService>;
    const scheduler = new ReputationRequestDeliverySchedulerService(deliveries);
    await expect(scheduler.runCycle()).resolves.toEqual({ attempted: 2, sent: 1 });
    expect(deliveries.runDue).toHaveBeenCalledWith(100);
  });

  it('stays inert unless ownership is explicitly enabled', () => {
    process.env = { ...original, REPUTATION_REQUEST_DELIVERY_SCHEDULER_ENABLED: 'false' };
    const timer = jest.spyOn(global, 'setInterval');
    const scheduler = new ReputationRequestDeliverySchedulerService({} as never);
    scheduler.onApplicationBootstrap();
    expect(timer).not.toHaveBeenCalled();
  });

  it('starts immediately, schedules bounded polling, and clears shutdown state', async () => {
    process.env = {
      ...original,
      REPUTATION_REQUEST_DELIVERY_SCHEDULER_ENABLED: 'true',
      REPUTATION_REQUEST_DELIVERY_INTERVAL_MS: '250',
    };
    const deliveries = {
      runDue: jest.fn().mockResolvedValue({ attempted: 0, sent: 0 }),
    } as unknown as jest.Mocked<ReputationRequestDeliveryService>;
    const fakeTimer = { unref: jest.fn() } as unknown as NodeJS.Timeout;
    const interval = jest.spyOn(global, 'setInterval').mockReturnValue(fakeTimer);
    const clear = jest.spyOn(global, 'clearInterval').mockImplementation(() => undefined);
    const scheduler = new ReputationRequestDeliverySchedulerService(deliveries);

    scheduler.onApplicationBootstrap();
    await Promise.resolve();
    expect(deliveries.runDue).toHaveBeenCalledWith(100);
    expect(interval).toHaveBeenCalledWith(expect.any(Function), 60_000);
    expect(fakeTimer.unref).toHaveBeenCalled();
    scheduler.onApplicationShutdown();
    expect(clear).toHaveBeenCalledWith(fakeTimer);
  });
});
