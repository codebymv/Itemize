import { CampaignTestEmailProvider } from './campaign-test-email.provider';
import {
  CampaignTestEmailDeliveryRow,
  CampaignTestEmailRepository,
} from './campaign-test-email.repository';
import { CampaignTestEmailService } from './campaign-test-email.service';

const delivery = (extra: Partial<CampaignTestEmailDeliveryRow> = {}): CampaignTestEmailDeliveryRow => ({
  id: 12, organization_id: 4, campaign_id: 9, requested_by_user_id: 7,
  idempotency_key: 'request-1', recipient_email: 'test@example.com', subject: '[TEST] Launch',
  payload: { html: '<p>Hello Test</p>', text: 'Hello Test', fromName: 'Sender',
    fromEmail: 'sender@example.com', replyTo: null },
  status: 'queued', attempt_count: 0, next_attempt_at: new Date(),
  lease_expires_at: null, claimed_by: null, provider_id: null, last_error: null,
  sent_at: null, created_at: new Date(), updated_at: new Date(), ...extra,
});

describe('CampaignTestEmailService', () => {
  let repository: jest.Mocked<CampaignTestEmailRepository>;
  let provider: jest.Mocked<CampaignTestEmailProvider>;
  let service: CampaignTestEmailService;

  beforeEach(() => {
    repository = {
      prepare: jest.fn(), claim: jest.fn(), find: jest.fn(), complete: jest.fn(),
      fail: jest.fn(), due: jest.fn(),
    } as unknown as jest.Mocked<CampaignTestEmailRepository>;
    provider = { send: jest.fn() };
    service = new CampaignTestEmailService(repository, provider);
  });

  it('claims and records provider-confirmed delivery with a stable provider key', async () => {
    const queued = delivery();
    repository.prepare.mockResolvedValue({ kind: 'created', delivery: queued });
    repository.claim.mockResolvedValue(delivery({ status: 'processing', attempt_count: 1 }));
    provider.send.mockResolvedValue({ kind: 'sent', providerId: 'email-12' });
    repository.complete.mockResolvedValue(delivery({
      status: 'sent', provider_id: 'email-12', sent_at: new Date(),
    }));

    await expect(service.send(4, 7, 9, ' test@example.com ', 'request-1')).resolves.toMatchObject({
      success: true, replayed: false, deliveryId: 12, status: 'sent', emailId: 'email-12',
    });
    expect(provider.send).toHaveBeenCalledWith(expect.objectContaining({
      to: 'test@example.com', subject: '[TEST] Launch',
      idempotencyKey: 'campaign-test-email:4:12',
    }));
  });

  it('records definite rejection for retry and ambiguous exceptions for reconciliation', async () => {
    repository.prepare.mockResolvedValue({ kind: 'created', delivery: delivery() });
    repository.claim.mockResolvedValue(delivery({ status: 'processing', attempt_count: 1 }));
    provider.send.mockResolvedValueOnce({ kind: 'rejected', message: 'provider rejected' });
    repository.fail.mockResolvedValueOnce(delivery({ status: 'retry', last_error: 'provider rejected' }));
    await expect(service.send(4, 7, 9, 'test@example.com', 'request-1')).resolves.toMatchObject({
      success: false, status: 'retry',
    });
    expect(repository.fail).toHaveBeenLastCalledWith(4, 12, 'provider rejected', false);

    repository.prepare.mockResolvedValue({ kind: 'created', delivery: delivery({ id: 13 }) });
    repository.claim.mockResolvedValue(delivery({ id: 13, status: 'processing', attempt_count: 1 }));
    provider.send.mockRejectedValueOnce(new Error('timeout after write'));
    repository.fail.mockResolvedValueOnce(delivery({
      id: 13, status: 'reconciliation_required', last_error: 'timeout after write',
    }));
    await expect(service.send(4, 7, 9, 'test@example.com', 'request-2')).resolves.toMatchObject({
      success: false, status: 'reconciliation_required',
    });
    expect(repository.fail).toHaveBeenLastCalledWith(4, 13, 'timeout after write', true);
  });

  it('returns terminal replay evidence without another provider call', async () => {
    repository.prepare.mockResolvedValue({
      kind: 'replayed', delivery: delivery({ status: 'sent', provider_id: 'email-12' }),
    });
    await expect(service.send(4, 7, 9, 'test@example.com', 'request-1')).resolves.toMatchObject({
      success: true, replayed: true, emailId: 'email-12',
    });
    expect(repository.claim).not.toHaveBeenCalled();
    expect(provider.send).not.toHaveBeenCalled();
  });

  it('conceals foreign campaigns and rejects idempotency-key reuse', async () => {
    repository.prepare.mockResolvedValueOnce({ kind: 'not_found' });
    await expect(service.send(4, 7, 99, 'test@example.com', 'request-1'))
      .rejects.toMatchObject({ extensions: { code: 'NOT_FOUND' } });
    repository.prepare.mockResolvedValueOnce({ kind: 'key_conflict' });
    await expect(service.send(4, 7, 9, 'other@example.com', 'request-1'))
      .rejects.toMatchObject({ extensions: { code: 'CONFLICT', reason: 'IDEMPOTENCY_KEY_REUSED' } });
  });

  it('rejects malformed campaign, email, and key inputs before persistence', async () => {
    await expect(service.send(4, 7, 0, 'test@example.com', 'request-1'))
      .rejects.toMatchObject({ extensions: { reason: 'INVALID_CAMPAIGN_ID' } });
    await expect(service.send(4, 7, 9, 'not-email', 'request-1'))
      .rejects.toMatchObject({ extensions: { reason: 'INVALID_CAMPAIGN_TEST_EMAIL' } });
    await expect(service.send(4, 7, 9, 'test@example.com', 'unsafe key'))
      .rejects.toMatchObject({ extensions: { reason: 'INVALID_IDEMPOTENCY_KEY' } });
    expect(repository.prepare).not.toHaveBeenCalled();
  });
});
