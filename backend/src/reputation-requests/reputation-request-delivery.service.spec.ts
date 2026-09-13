import {
  ReputationEmailProvider,
  ReputationSmsProvider,
} from './reputation-request-delivery.providers';
import {
  ReputationDeliverySnapshot,
  ReputationRequestDeliveryRepository,
} from './reputation-request-delivery.repository';
import { ReputationRequestDeliveryService } from './reputation-request-delivery.service';
import { ReputationRequestsRepository } from './reputation-requests.repository';
import { ReputationRequestsService } from './reputation-requests.service';

const requestRow = {
  id: 8, organization_id: 3, contact_id: 4, contact_email: 'ada@example.test',
  contact_phone: '+16025550123', contact_name: 'Ada', channel: 'email', template_id: null,
  email_sent: false, email_sent_at: null, email_opened: false, email_opened_at: null,
  sms_sent: false, sms_sent_at: null, clicked: false, clicked_at: null,
  rating_given: null, review_submitted: false, review_submitted_at: null, review_id: null,
  preferred_platform: null, redirect_url: null, status: 'pending', scheduled_at: null,
  expires_at: null, custom_message: null, created_at: new Date('2026-07-21T09:00:00Z'),
  updated_at: new Date('2026-07-21T09:00:00Z'), contact_first_name: 'Ada',
  contact_last_name: null, current_contact_email: 'ada@example.test',
};

const snapshot = (channel: 'email' | 'sms' = 'email'): ReputationDeliverySnapshot => ({
  batch: {
    id: 14, organization_id: 3, requested_by_user_id: 2, idempotency_key: 'request-14',
    operation: 'send', input_fingerprint: 'a'.repeat(64), status: 'queued',
    completed_at: null, created_at: new Date(), updated_at: new Date(),
  },
  deliveries: [{
    id: 21, batch_id: 14, organization_id: 3, review_request_id: 8, channel,
    recipient: channel === 'email' ? 'ada@example.test' : '+16025550123',
    subject: channel === 'email' ? 'Feedback' : null,
    payload: { message: 'Please review https://itemize.cloud/review/token' }, status: 'queued',
    attempt_count: 0, next_attempt_at: new Date(), lease_expires_at: null, claimed_by: null,
    provider_id: null, last_error: null, sent_at: null, created_at: new Date(), updated_at: new Date(),
  }],
});

describe('ReputationRequestDeliveryService', () => {
  let deliveries: jest.Mocked<ReputationRequestDeliveryRepository>;
  let requestsRepository: jest.Mocked<ReputationRequestsRepository>;
  let requestsService: ReputationRequestsService;
  let email: jest.Mocked<ReputationEmailProvider>;
  let sms: jest.Mocked<ReputationSmsProvider>;
  let service: ReputationRequestDeliveryService;

  beforeEach(() => {
    deliveries = {
      prepareSend: jest.fn(), prepareBulk: jest.fn(), prepareResend: jest.fn(),
      findSnapshot: jest.fn(), due: jest.fn(), claim: jest.fn(), complete: jest.fn(), fail: jest.fn(),
    } as unknown as jest.Mocked<ReputationRequestDeliveryRepository>;
    requestsRepository = {
      findByIds: jest.fn().mockResolvedValue([requestRow]),
    } as unknown as jest.Mocked<ReputationRequestsRepository>;
    requestsService = new ReputationRequestsService(requestsRepository);
    email = { send: jest.fn() };
    sms = { send: jest.fn() };
    service = new ReputationRequestDeliveryService(
      deliveries, requestsRepository, requestsService, email, sms,
    );
  });

  it('confirms immediate email before returning sent and uses a durable provider key', async () => {
    const initial = snapshot('email');
    deliveries.prepareSend.mockResolvedValue({ kind: 'created', snapshot: initial });
    deliveries.claim.mockResolvedValue({ ...initial.deliveries[0], status: 'processing', attempt_count: 1 });
    email.send.mockResolvedValue({ kind: 'sent', providerId: 'email-44' });
    deliveries.findSnapshot.mockResolvedValue({
      ...initial,
      batch: { ...initial.batch, status: 'sent' },
      deliveries: [{ ...initial.deliveries[0], status: 'sent' }],
    });

    await expect(service.send(3, 2, {
      idempotencyKey: 'request-14', contactId: 4, channel: 'email',
    })).resolves.toMatchObject({ batchId: 14, status: 'sent', accepted: 1, sent: 1 });
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({
      to: 'ada@example.test', idempotencyKey: 'review-request-email:3:21',
      durableDelivery: expect.objectContaining({source:'review_request',organizationId:3,deliveryId:21}),
    }));
    expect(deliveries.complete).toHaveBeenCalledWith(3, 21, 'email-44', 1);
    expect(sms.send).not.toHaveBeenCalled();
  });

  it.each([false, true])('handles email failure with unknown acceptance=%s', async unknown => {
    const initial = snapshot('email');
    deliveries.prepareSend.mockResolvedValue({ kind: 'created', snapshot: initial });
    deliveries.claim.mockResolvedValue({ ...initial.deliveries[0], status: 'processing', attempt_count: 1 });
    email.send.mockRejectedValue(Object.assign(new Error('failure for ada@example.test'), { providerOutcomeUnknown: unknown }));
    deliveries.findSnapshot.mockResolvedValue({
      ...initial, batch: { ...initial.batch, status: 'processing' },
      deliveries: [{ ...initial.deliveries[0], status: 'retry' }],
    });

    await expect(service.send(3, 2, {
      idempotencyKey: 'request-14', contactEmail: 'ada@example.test', channel: 'email',
    })).resolves.toMatchObject({ status: 'processing', sent: 0 });
    expect(deliveries.fail).toHaveBeenCalledWith(3, 21, 'failure for [recipient]', unknown, 1);
  });

  it('quarantines an ambiguous SMS result instead of risking duplicate delivery', async () => {
    const initial = snapshot('sms');
    deliveries.prepareSend.mockResolvedValue({ kind: 'created', snapshot: initial });
    deliveries.claim.mockResolvedValue({ ...initial.deliveries[0], status: 'processing', attempt_count: 1 });
    sms.send.mockRejectedValue(new Error('provider outcome unknown'));
    deliveries.findSnapshot.mockResolvedValue({
      ...initial, batch: { ...initial.batch, status: 'reconciliation_required' },
      deliveries: [{ ...initial.deliveries[0], status: 'reconciliation_required' }],
    });

    await expect(service.send(3, 2, {
      idempotencyKey: 'request-14', contactPhone: '+16025550123', channel: 'sms',
    })).resolves.toMatchObject({ status: 'reconciliation_required', sent: 0 });
    expect(deliveries.fail).toHaveBeenCalledWith(3, 21, 'provider outcome unknown', true, 1);
    expect(deliveries.complete).not.toHaveBeenCalled();
  });

  it('leaves scheduled and bulk delivery for the durable worker', async () => {
    const scheduled = snapshot('email');
    deliveries.prepareSend.mockResolvedValue({ kind: 'created', snapshot: scheduled });
    deliveries.prepareBulk.mockResolvedValue({ kind: 'created', snapshot: scheduled });
    deliveries.findSnapshot.mockResolvedValue(scheduled);
    const future = new Date(Date.now() + 60_000);

    await service.send(3, 2, {
      idempotencyKey: 'scheduled-14', contactId: 4, channel: 'email', scheduledAt: future,
    });
    await service.bulk(3, 2, {
      idempotencyKey: 'bulk-14', contactIds: [4], channel: 'email',
    });
    expect(deliveries.claim).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
  });

  it('does not count a stale completion as a successful worker delivery', async () => {
    deliveries.due.mockResolvedValue([{ organizationId: 3, id: 21 }]);
    deliveries.claim.mockResolvedValue({ ...snapshot().deliveries[0], status: 'processing', attempt_count: 2 });
    email.send.mockResolvedValue({ kind: 'sent', providerId: 'accepted' });
    deliveries.complete.mockResolvedValue(false);
    await expect(service.runDue()).resolves.toEqual({ attempted: 1, sent: 0 });
    expect(deliveries.complete).toHaveBeenCalledWith(3, 21, 'accepted', 2);
    expect(deliveries.fail).not.toHaveBeenCalled();
  });

  it('fails closed on conflicting idempotency-key reuse', async () => {
    deliveries.prepareSend.mockResolvedValue({ kind: 'key_conflict' });
    await expect(service.send(3, 2, {
      idempotencyKey: 'request-14', contactId: 4, channel: 'email',
    })).rejects.toMatchObject({
      extensions: { code: 'CONFLICT', reason: 'REVIEW_REQUEST_IDEMPOTENCY_CONFLICT' },
    });
    expect(deliveries.claim).not.toHaveBeenCalled();
  });
});
