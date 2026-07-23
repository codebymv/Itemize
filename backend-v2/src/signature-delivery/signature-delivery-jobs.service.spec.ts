import { WorkflowEmailProvider } from '../workflow-jobs/workflow-side-effect.providers';
import {
  SignatureDeliveryClaim,
  SignatureDeliveryJobsRepository,
} from './signature-delivery-jobs.repository';
import { SignatureDeliveryJobsService } from './signature-delivery-jobs.service';

describe('SignatureDeliveryJobsService', () => {
  const repository = {
    enqueueDueReminders: jest.fn(),
    claim: jest.fn(),
    markSent: jest.fn(),
    markFailure: jest.fn(),
  } as unknown as jest.Mocked<SignatureDeliveryJobsRepository>;
  const email = { send: jest.fn() } as jest.Mocked<WorkflowEmailProvider>;
  const service = new SignatureDeliveryJobsService(repository, email);
  const claim: SignatureDeliveryClaim = {
    id: 11,
    idempotency_key: 'signature-request-v1-22-33',
    organization_id: 4,
    document_id: 22,
    recipient_id: 33,
    reminder_id: null,
    delivery_type: 'signature_request',
    payload: {
      to: 'signer@example.com',
      recipientName: 'Signer',
      documentTitle: 'NDA',
      senderName: 'Sender',
      senderEmail: 'sender@example.com',
      message: 'Please sign',
      expiresAt: '2026-08-01T00:00:00.000Z',
    },
    attempt_count: 1,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'signature-job-test-secret-at-least-32-characters';
    repository.enqueueDueReminders.mockResolvedValue(0);
    repository.claim.mockResolvedValueOnce(claim).mockResolvedValue(null);
    repository.markSent.mockResolvedValue(true);
    email.send.mockResolvedValue({ providerId: 'provider-1' });
  });

  it('delivers a leased claim with stable provider idempotency and marks it sent', async () => {
    await expect(service.run()).resolves.toMatchObject({ claimed: 1, sent: 1 });
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({
      to: 'signer@example.com',
      idempotencyKey: claim.idempotency_key,
      tags: expect.arrayContaining([
        { name: 'signature_document_id', value: '22' },
        { name: 'signature_recipient_id', value: '33' },
      ]),
    }));
    expect(repository.markSent).toHaveBeenCalledWith(claim, 'provider-1');
  });

  it('records retry and dead-letter outcomes without acknowledging delivery', async () => {
    email.send.mockRejectedValueOnce(new Error('temporary provider failure'));
    repository.markFailure.mockResolvedValueOnce('retry');
    await expect(service.run()).resolves.toMatchObject({ retry: 1, sent: 0 });
    expect(repository.markSent).not.toHaveBeenCalled();

    jest.clearAllMocks();
    repository.enqueueDueReminders.mockResolvedValue(0);
    repository.claim.mockResolvedValueOnce(claim).mockResolvedValue(null);
    email.send.mockRejectedValueOnce(Object.assign(new Error('invalid payload'), {
      retryable: false,
    }));
    repository.markFailure.mockResolvedValueOnce('dead_letter');
    await expect(service.run()).resolves.toMatchObject({ deadLetter: 1, sent: 0 });
  });

  it('does not enqueue scheduled reminders for a targeted replay', async () => {
    repository.claim.mockReset().mockResolvedValueOnce(claim);
    await service.run({ outboxId: claim.id });
    expect(repository.enqueueDueReminders).not.toHaveBeenCalled();
    expect(repository.claim).toHaveBeenCalledWith(300, claim.id);
  });
});
