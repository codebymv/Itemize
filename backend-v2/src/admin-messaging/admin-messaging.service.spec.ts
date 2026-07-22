import { GraphQLError } from 'graphql';
import { AdminEmailProvider } from './admin-email.provider';
import { AdminEmailDeliveryService } from './admin-email-delivery.service';
import { AdminMessagingRepository } from './admin-messaging.repository';
import { AdminMessagingService } from './admin-messaging.service';

describe('AdminMessagingService', () => {
  let repository: jest.Mocked<AdminMessagingRepository>;
  let provider: jest.Mocked<AdminEmailProvider>;
  let service: AdminMessagingService;
  let delivery: AdminEmailDeliveryService;

  beforeEach(() => {
    repository = {
      logs: jest.fn(), log: jest.fn(), templates: jest.fn(), enqueue: jest.fn(),
      due: jest.fn(), claim: jest.fn(), complete: jest.fn(), fail: jest.fn(),
    } as unknown as jest.Mocked<AdminMessagingRepository>;
    provider = { send: jest.fn() };
    service = new AdminMessagingService(repository);
    delivery = new AdminEmailDeliveryService(repository, provider);
  });

  it('renders a bounded, personalized preview without provider work', () => {
    const preview = service.preview({ subject: 'Hello {{ userName }}', bodyHtml: '<p>{{userEmail}}</p>', baseUrl: 'https://app.example.test/path' });
    expect(preview.subject).toBe('Hello John Doe');
    expect(preview.html).toContain('<p>john@example.com</p>');
    expect(preview.html).toContain('https://app.example.test/cover.png');
    expect(provider.send).not.toHaveBeenCalled();
    expect(() => service.preview({ subject: 'x', bodyHtml: 'x', baseUrl: 'file:///etc/passwd' }))
      .toThrow(expect.objectContaining<Partial<GraphQLError>>({ extensions: expect.objectContaining({ code: 'BAD_USER_INPUT' }) }));
  });

  it('queues a normalized batch and never contacts the provider in the mutation path', async () => {
    repository.enqueue.mockResolvedValue({ kind: 'created', batchId: 41, status: 'queued', accepted: 1 });
    await expect(delivery.enqueue(7, {
      recipients: [{ id: 9, email: ' User@Example.Test ', name: ' Pat ' }],
      subject: 'Hi {{userName}}', bodyHtml: '<p>{{ userEmail }}</p>', idempotencyKey: 'request-1',
    })).resolves.toEqual({ batchId: 41, status: 'queued', accepted: 1, replayed: false });
    const queued = repository.enqueue.mock.calls[0][0];
    expect(queued.recipients[0]).toMatchObject({ email: 'user@example.test', name: 'Pat', subject: 'Hi Pat' });
    expect(queued.recipients[0].bodyHtml).toContain('user@example.test');
    expect(queued.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(provider.send).not.toHaveBeenCalled();
  });

  it('rejects duplicate recipients and idempotency conflicts', async () => {
    const duplicate = delivery.enqueue(7, {
      recipients: [{ email: 'a@example.test' }, { email: 'A@example.test' }],
      subject: 'x', bodyHtml: 'y', idempotencyKey: 'request-2',
    });
    await expect(duplicate).rejects.toMatchObject<Partial<GraphQLError>>({ extensions: expect.objectContaining({ code: 'BAD_USER_INPUT' }) });
    repository.enqueue.mockResolvedValue({ kind: 'key_conflict' });
    await expect(delivery.enqueue(7, {
      recipients: [{ email: 'a@example.test' }], subject: 'x', bodyHtml: 'y', idempotencyKey: 'request-2',
    })).rejects.toMatchObject<Partial<GraphQLError>>({ extensions: expect.objectContaining({ code: 'CONFLICT' }) });
  });

  it('leases due jobs and records provider outcomes', async () => {
    repository.due.mockResolvedValue([12, 13]);
    repository.claim
      .mockResolvedValueOnce({ id: 12, batch_id: 3, recipient_email: 'a@example.test', subject: 'A', body_html: '<p>A</p>', status: 'processing', attempt_count: 1, provider_id: null, last_error: null })
      .mockResolvedValueOnce({ id: 13, batch_id: 3, recipient_email: 'b@example.test', subject: 'B', body_html: '<p>B</p>', status: 'processing', attempt_count: 1, provider_id: null, last_error: null });
    provider.send.mockResolvedValueOnce({ kind: 'sent', providerId: 'email-12' })
      .mockResolvedValueOnce({ kind: 'rejected', message: 'rate limited' });
    repository.fail.mockResolvedValue('retry');
    await expect(delivery.runDue()).resolves.toEqual({ attempted: 2, sent: 1 });
    expect(repository.complete).toHaveBeenCalledWith(12, 'email-12');
    expect(repository.fail).toHaveBeenCalledWith(13, 'rate limited', false);
    expect(provider.send).toHaveBeenNthCalledWith(1, expect.objectContaining({ idempotencyKey: 'admin-email:3:12' }));
  });

  it('quarantines ambiguous provider failures for reconciliation', async () => {
    repository.due.mockResolvedValue([12]);
    repository.claim.mockResolvedValue({ id: 12, batch_id: 3, recipient_email: 'a@example.test', subject: 'A', body_html: '<p>A</p>', status: 'processing', attempt_count: 1, provider_id: null, last_error: null });
    provider.send.mockRejectedValue(new Error('connection closed after write'));
    repository.fail.mockResolvedValue('reconciliation_required');
    await delivery.runDue();
    expect(repository.fail).toHaveBeenCalledWith(12, 'connection closed after write', true);
  });
});
