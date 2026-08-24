import { CampaignsService } from '../campaigns/campaigns.service';
import { CampaignSendRepository, ClaimedCampaignRecipient } from './campaign-send.repository';
import { CampaignSendService } from './campaign-send.service';
import { CampaignTestEmailProvider } from './campaign-test-email.provider';

const claimed = (extra: Partial<ClaimedCampaignRecipient> = {}): ClaimedCampaignRecipient => ({
  id: 12, organization_id: 4, campaign_id: 9, delivery_job_id: 7,
  email: 'recipient@example.com', first_name: 'Ada', last_name: 'Lovelace',
  delivery_attempt_count: 1,
  payload: {
    subject: 'Hello {{ first_name }}', html: '<p>{{full_name}} / {{email}}</p>',
    text: 'Hello {{last_name}}', fromName: 'Sender', fromEmail: 'sender@example.com',
    replyTo: null,
  },
  ...extra,
});

describe('CampaignSendService worker', () => {
  let repository: jest.Mocked<CampaignSendRepository>;
  let provider: jest.Mocked<CampaignTestEmailProvider>;
  let campaigns: jest.Mocked<CampaignsService>;
  let service: CampaignSendService;

  beforeEach(() => {
    repository = {
      due: jest.fn(), claim: jest.fn(), complete: jest.fn(), fail: jest.fn(), prepare: jest.fn(),
      pause: jest.fn(), resume: jest.fn(),
    } as unknown as jest.Mocked<CampaignSendRepository>;
    provider = { send: jest.fn() };
    campaigns = { detail: jest.fn() } as unknown as jest.Mocked<CampaignsService>;
    service = new CampaignSendService(repository, campaigns, provider);
    repository.due.mockResolvedValue([{ id: 12, organizationId: 4 }]);
    repository.claim.mockResolvedValue(claimed());
  });

  it('records confirmed delivery with substitutions and a stable recipient-intent key', async () => {
    provider.send.mockResolvedValue({ kind: 'sent', providerId: 'provider-12' });

    await expect(service.runDue()).resolves.toEqual({ attempted: 1, sent: 1 });
    expect(provider.send).toHaveBeenCalledWith(expect.objectContaining({
      to: 'recipient@example.com', subject: 'Hello Ada',
      html: '<p>Ada Lovelace / recipient@example.com</p>', text: 'Hello Lovelace',
      idempotencyKey: 'campaign-recipient-email:4:12',
    }));
    expect(repository.complete).toHaveBeenCalledWith(4, 12, 'provider-12');
    expect(repository.fail).not.toHaveBeenCalled();
  });

  it('retries definite rejection but quarantines an ambiguous provider exception', async () => {
    provider.send.mockResolvedValueOnce({ kind: 'rejected', message: 'rejected' });
    await expect(service.runDue()).resolves.toEqual({ attempted: 1, sent: 0 });
    expect(repository.fail).toHaveBeenLastCalledWith(4, 12, 'rejected', false);

    provider.send.mockRejectedValueOnce(new Error('timeout after write'));
    await expect(service.runDue()).resolves.toEqual({ attempted: 1, sent: 0 });
    expect(repository.fail).toHaveBeenLastCalledWith(4, 12, 'timeout after write', true);
  });

  it('maps durable pause/resume outcomes and rejects legacy delivery state', async () => {
    campaigns.detail.mockResolvedValue({ id: 9, status: 'paused' } as never);
    repository.pause.mockResolvedValue({ kind: 'ok', pendingRecipients: 3 });
    await expect(service.pause(4, 9)).resolves.toMatchObject({
      campaign: { id: 9, status: 'paused' }, pendingRecipients: 3, message: 'Campaign paused',
    });

    campaigns.detail.mockResolvedValue({ id: 9, status: 'sending' } as never);
    repository.resume.mockResolvedValue({ kind: 'ok', pendingRecipients: 3 });
    await expect(service.resume(4, 9)).resolves.toMatchObject({
      campaign: { id: 9, status: 'sending' }, pendingRecipients: 3, message: 'Campaign resumed',
    });

    repository.resume.mockResolvedValue({ kind: 'delivery_unavailable' });
    await expect(service.resume(4, 9)).rejects.toMatchObject({
      extensions: expect.objectContaining({ reason: 'CAMPAIGN_DELIVERY_UNAVAILABLE' }),
    });
  });
});
