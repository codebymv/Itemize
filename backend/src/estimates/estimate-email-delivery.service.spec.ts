import { EstimateEmailDeliveryService } from './estimate-email-delivery.service';
import { EstimatesRepository } from './estimates.repository';
import { ActivationService } from '../activation/activation.service';

describe('estimate delivery attempt ownership', () => {
  it.each([
    ['processing', 3, false], ['sent', 3, false],
    ['reconciliation_required', 2, false], ['sent', 2, true],
  ])('records activation only for its own sent outcome: %s attempt %s', async (status, attemptCount, activated) => {
    const claimed = { id: 7, organization_id: 1, estimate_id: 9, delivery_type: 'estimate_sent',
      status: 'processing', attempt_count: 2, recipient_email: 'qa@example.test', subject: 'QA' };
    const repository = {
      dueEmailDeliveryIds: jest.fn().mockResolvedValue([{ organizationId: 1, id: 7 }]),
      claimEmailDelivery: jest.fn().mockResolvedValue(claimed),
      completeEmailDelivery: jest.fn().mockResolvedValue({ ...claimed, status, attempt_count: attemptCount }),
    };
    const provider = { send: jest.fn().mockResolvedValue({ kind: 'sent', providerId: 'accepted' }) };
    const activation = { recordArtifactSent: jest.fn() };
    const service = new EstimateEmailDeliveryService(repository as unknown as EstimatesRepository,
      provider, activation as unknown as ActivationService);
    // Rendering is independent of claim ownership and covered by template/integration tests.
    jest.spyOn(service as any, 'html').mockReturnValue('<p>QA</p>');
    jest.spyOn(service as any, 'text').mockReturnValue('QA');
    await service.runDue();
    expect(repository.completeEmailDelivery).toHaveBeenCalledWith(1, 7, 'accepted', 2);
    expect(activation.recordArtifactSent).toHaveBeenCalledTimes(activated ? 1 : 0);
  });
});
