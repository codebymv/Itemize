import {
  WorkflowDeliveryError,
  WorkflowEmailProvider,
  WorkflowSmsProvider,
  WorkflowWebhookProvider,
} from './workflow-side-effect.providers';
import { WorkflowSideEffectClaim, WorkflowSideEffectJobsRepository } from './workflow-side-effect-jobs.repository';
import { WorkflowSideEffectJobsService } from './workflow-side-effect-jobs.service';

const claim = (extra: Partial<WorkflowSideEffectClaim> = {}): WorkflowSideEffectClaim => ({
  id: 8, idempotency_key: 'workflow-3-4-5', organization_id: 2, enrollment_id: 3, step_id: 4,
  effect_type: 'email', payload: { to: 'person@example.test', subject: 'Hello', bodyHtml: '<p>Hello</p>' },
  attempt_count: 1, ...extra,
});

describe('WorkflowSideEffectJobsService', () => {
  let repository: jest.Mocked<WorkflowSideEffectJobsRepository>;
  let email: jest.Mocked<WorkflowEmailProvider>;
  let sms: jest.Mocked<WorkflowSmsProvider>;
  let webhook: jest.Mocked<WorkflowWebhookProvider>;
  let service: WorkflowSideEffectJobsService;

  beforeEach(() => {
    repository = { quarantineExpiredSms: jest.fn().mockResolvedValue(0), claim: jest.fn(),
      markSent: jest.fn().mockResolvedValue(true), markFailure: jest.fn() } as any;
    email = { send: jest.fn() };
    sms = { send: jest.fn() };
    webhook = { send: jest.fn() };
    service = new WorkflowSideEffectJobsService(repository, email, sms, webhook);
  });

  it('delivers email with the stable key and provider correlation', async () => {
    repository.claim.mockResolvedValueOnce(claim()).mockResolvedValueOnce(null);
    email.send.mockResolvedValue({ providerId: 'email-8' });
    await expect(service.run()).resolves.toMatchObject({ claimed: 1, sent: 1 });
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({
      to: 'person@example.test', idempotencyKey: 'workflow-3-4-5',
      tags: [{ name: 'workflow_enrollment_id', value: '3' }, { name: 'workflow_step_id', value: '4' }],
    }));
    expect(repository.markSent).toHaveBeenCalledWith(expect.objectContaining({ id: 8 }), 'email-8');
  });

  it('dispatches SMS and webhook snapshots without changing their immutable payloads', async () => {
    repository.claim
      .mockResolvedValueOnce(claim({ id: 9, effect_type: 'sms', payload: { to: '+16025550101', from: '+16025550100', message: 'Hi' } }))
      .mockResolvedValueOnce(claim({ id: 10, effect_type: 'webhook', payload: { url: 'https://example.com/hook', method: 'POST', headers: { Authorization: 'Bearer tenant' }, body: { stable: true } } }))
      .mockResolvedValueOnce(null);
    sms.send.mockResolvedValue({ providerId: 'SM123' });
    webhook.send.mockResolvedValue({ providerId: 'request-10' });
    await expect(service.run()).resolves.toMatchObject({ claimed: 2, sent: 2 });
    expect(sms.send).toHaveBeenCalledWith({ to: '+16025550101', from: '+16025550100', message: 'Hi' });
    expect(webhook.send).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://example.com/hook', body: { stable: true }, idempotencyKey: 'workflow-3-4-5',
    }));
  });

  it.each([
    ['retry', { retry: 1 }], ['dead_letter', { deadLetter: 1 }], ['cancelled', { cancelled: 1 }],
    ['reconciliation_required', { reconciliationRequired: 1 }], ['stale', { stale: 1 }],
  ] as const)('records the %s durable failure outcome', async (outcome, expected) => {
    repository.claim.mockResolvedValueOnce(claim()).mockResolvedValueOnce(null);
    email.send.mockRejectedValue(new WorkflowDeliveryError('failure'));
    repository.markFailure.mockResolvedValue(outcome);
    await expect(service.run()).resolves.toMatchObject({ claimed: 1, ...expected });
  });

  it('reports expired SMS quarantine and runs one targeted item', async () => {
    repository.quarantineExpiredSms.mockResolvedValue(2);
    repository.claim.mockResolvedValue(claim({ id: 12 }));
    email.send.mockResolvedValue({ providerId: null });
    await expect(service.run({ outboxId: 12, batchSize: 100 })).resolves.toMatchObject({
      claimed: 1, sent: 1, reconciliationRequired: 2,
    });
    expect(repository.claim).toHaveBeenCalledTimes(1);
    expect(repository.claim).toHaveBeenCalledWith(300, 12);
  });
});
