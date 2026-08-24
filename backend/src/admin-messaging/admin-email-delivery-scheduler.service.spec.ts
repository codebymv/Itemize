import { AdminEmailDeliverySchedulerService } from './admin-email-delivery-scheduler.service';
import { AdminEmailDeliveryService } from './admin-email-delivery.service';

describe('AdminEmailDeliverySchedulerService', () => {
  const original = process.env;
  afterEach(() => { process.env = original; jest.restoreAllMocks(); });

  it('uses bounded batch configuration', async () => {
    process.env = { ...original, ADMIN_EMAIL_DELIVERY_BATCH_SIZE: '9000' };
    const delivery = { runDue: jest.fn().mockResolvedValue({ attempted: 0, sent: 0 }) } as unknown as jest.Mocked<AdminEmailDeliveryService>;
    await new AdminEmailDeliverySchedulerService(delivery).runCycle();
    expect(delivery.runDue).toHaveBeenCalledWith(100);
  });

  it('does not schedule unless explicitly enabled', () => {
    process.env = { ...original, ADMIN_EMAIL_DELIVERY_SCHEDULER_ENABLED: 'false' };
    const interval = jest.spyOn(global, 'setInterval');
    const scheduler = new AdminEmailDeliverySchedulerService({} as never);
    scheduler.onApplicationBootstrap();
    expect(interval).not.toHaveBeenCalled();
  });
});
