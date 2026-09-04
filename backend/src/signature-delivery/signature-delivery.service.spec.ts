import { SignatureDeliveryRepository } from './signature-delivery.repository';
import { SignatureDeliveryService } from './signature-delivery.service';
import { SignatureDocumentsService } from '../signature-documents/signature-documents.service';
import { SignatureFileStorage } from '../signature-files/signature-file-storage.provider';

describe('SignatureDeliveryService', () => {
  const repository = {
    hasFeatureAccess: jest.fn(),
    preflightSource: jest.fn(),
    enqueueInitial: jest.fn(),
    enqueueReminder: jest.fn(),
    retryFailures: jest.fn(),
    scheduleReminders: jest.fn(),
  } as unknown as jest.Mocked<SignatureDeliveryRepository>;
  const documents = {
    detail: jest.fn(),
  } as unknown as jest.Mocked<SignatureDocumentsService>;
  const storage = { read: jest.fn() } as unknown as jest.Mocked<SignatureFileStorage>;
  const service = new SignatureDeliveryService(repository, documents, storage);

  beforeEach(() => {
    jest.clearAllMocks();
    repository.hasFeatureAccess.mockResolvedValue(true);
    repository.preflightSource.mockResolvedValue({
      status: 'draft',
      fileUrl: '/private/nda.pdf',
      originalSha256: 'a'.repeat(64),
      pageCount: 1,
    });
    repository.enqueueInitial.mockResolvedValue({ kind: 'applied' });
    repository.enqueueReminder.mockResolvedValue({ kind: 'applied' });
    repository.retryFailures.mockResolvedValue({ kind: 'applied' });
    documents.detail.mockResolvedValue({
      document: { id: 7, title: 'NDA' },
    } as Awaited<ReturnType<SignatureDocumentsService['detail']>>);
  });

  it('queues send and reminder intents before returning authoritative document state', async () => {
    await expect(service.send(3, 7, 19, 'send-key')).resolves.toMatchObject({ id: 7 });
    await expect(service.remind(3, 7, 19, 'remind-key')).resolves.toMatchObject({ id: 7 });
    expect(repository.enqueueInitial).toHaveBeenCalledWith(
      3,
      7,
      19,
      'send-key',
      expect.stringMatching(/^[a-f0-9]{64}$/),
      undefined,
    );
    expect(repository.enqueueReminder).toHaveBeenCalledWith(
      3,
      7,
      19,
      'remind-key',
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
    expect(documents.detail).toHaveBeenNthCalledWith(1, 3, 7);
    expect(documents.detail).toHaveBeenNthCalledWith(2, 3, 7);
  });

  it('validates reminder schedules and maps repository state conflicts', async () => {
    repository.scheduleReminders.mockResolvedValue({
      scheduledAt: new Date('2026-08-01T00:00:00Z'),
      reminderCount: 2,
    });
    await expect(service.schedule(3, 7, 5, 19)).resolves.toMatchObject({ reminderCount: 2 });
    await expect(service.schedule(3, 7, 0, 19)).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT', reason: 'INVALID_SIGNATURE_REMINDER_DAYS' },
    });
  });

  it('queues an operator-requested retry for failed delivery or completion work', async () => {
    await expect(service.retry(3, 7, 19, 'retry-key')).resolves.toMatchObject({ id: 7 });
    expect(repository.retryFailures).toHaveBeenCalledWith(
      3,
      7,
      19,
      'retry-key',
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
    expect(documents.detail).toHaveBeenCalledWith(3, 7);
  });

  it('validates delivery keys and reports conflicting or unavailable replays', async () => {
    await expect(service.send(3, 7, 19, '')).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT', reason: 'INVALID_IDEMPOTENCY_KEY' },
    });
    repository.enqueueReminder.mockResolvedValueOnce({ kind: 'idempotency_conflict' });
    await expect(service.remind(3, 7, 19, 'reused-key')).rejects.toMatchObject({
      extensions: { code: 'CONFLICT', reason: 'IDEMPOTENCY_KEY_REUSED' },
    });
    repository.retryFailures.mockResolvedValueOnce({ kind: 'idempotency_result_unavailable' });
    await expect(service.retry(3, 7, 19, 'missing-key')).rejects.toMatchObject({
      extensions: { code: 'CONFLICT', reason: 'IDEMPOTENCY_RESULT_UNAVAILABLE' },
    });
  });

  it('renders a bounded server-controlled preview and escapes user content', async () => {
    const preview = await service.preview(3, {
      message: 'Please <script>alert(1)</script> sign',
      documentTitle: '<b>NDA</b>',
      senderName: 'Alice & Bob',
      expiresAt: new Date('2026-08-01T23:00:00-07:00'),
    });

    expect(preview.subject).toBe('Your signature is requested');
    expect(preview.html).toContain('Please &lt;script&gt;alert(1)&lt;/script&gt; sign');
    expect(preview.html).toContain('&lt;b&gt;NDA&lt;/b&gt;');
    expect(preview.html).toContain('Expires on August 2, 2026');
    expect(preview.html).toContain('http://localhost:5173/sign/preview');
    expect(preview.html).toContain('https://itemize.cloud/cover.png');
    expect(preview.html).toContain('Email preview');
    expect(preview.html).not.toContain('<script>');
  });

  it('rejects empty, oversized, and invalid sender input before rendering', async () => {
    await expect(service.preview(3, { message: '  ' })).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT', reason: 'EMPTY_SIGNATURE_EMAIL_MESSAGE' },
    });
    await expect(service.preview(3, { message: 'x'.repeat(50_001) })).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT', reason: 'SIGNATURE_EMAIL_MESSAGE_TOO_LONG' },
    });
    await expect(service.preview(3, { message: 'Sign', senderEmail: 'not-an-email' })).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT', reason: 'INVALID_SIGNATURE_SENDER_EMAIL' },
    });
  });

  it('fails closed when the organization cannot use e-signatures', async () => {
    repository.hasFeatureAccess.mockResolvedValue(false);
    await expect(service.preview(3, { message: 'Sign' })).rejects.toMatchObject({
      extensions: { code: 'FORBIDDEN', reason: 'FEATURE_NOT_AVAILABLE' },
    });
  });
});
