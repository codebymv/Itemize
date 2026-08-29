import { CampaignUnsubscribeRepository } from './campaign-unsubscribe.repository';
import { CampaignUnsubscribeService } from './campaign-unsubscribe.service';
import { campaignUnsubscribeToken } from './campaign-unsubscribe.token';

describe('CampaignUnsubscribeService', () => {
  const recipient = {
    recipientId: 12,
    organizationId: 4,
    campaignId: 9,
    email: 'recipient@example.com',
    alreadyUnsubscribed: false,
  };
  let repository: jest.Mocked<CampaignUnsubscribeRepository>;
  let service: CampaignUnsubscribeService;

  beforeEach(() => {
    process.env.JWT_SECRET = 'campaign-unsubscribe-test-secret-at-least-32-characters';
    repository = {
      find: jest.fn(),
      unsubscribe: jest.fn(),
    } as unknown as jest.Mocked<CampaignUnsubscribeRepository>;
    service = new CampaignUnsubscribeService(repository);
  });

  it('inspects without mutation and performs an authenticated idempotent unsubscribe', async () => {
    const token = campaignUnsubscribeToken(recipient);
    repository.find.mockResolvedValue(recipient);
    repository.unsubscribe.mockResolvedValue(true);

    await expect(service.inspect(token)).resolves.toBe('ready');
    expect(repository.unsubscribe).not.toHaveBeenCalled();
    await expect(service.unsubscribe(token)).resolves.toBe('unsubscribed');
    expect(repository.unsubscribe).toHaveBeenCalledWith(recipient);

    repository.find.mockResolvedValue({ ...recipient, alreadyUnsubscribed: true });
    await expect(service.inspect(token)).resolves.toBe('unsubscribed');
  });

  it('does not mutate for malformed, forged, or missing recipient tokens', async () => {
    await expect(service.unsubscribe('bad-token')).resolves.toBe('invalid');
    expect(repository.find).not.toHaveBeenCalled();

    const token = campaignUnsubscribeToken(recipient);
    repository.find.mockResolvedValue({ ...recipient, campaignId: 10 });
    await expect(service.unsubscribe(token)).resolves.toBe('invalid');
    repository.find.mockResolvedValue(null);
    await expect(service.unsubscribe(token)).resolves.toBe('invalid');
    expect(repository.unsubscribe).not.toHaveBeenCalled();
  });
});
