import { PDFDocument } from 'pdf-lib';
import { SignatureFileStorage } from '../signature-files/signature-file-storage.provider';
import { SignatureCompletionJobsRepository } from './signature-completion-jobs.repository';
import { SignatureCompletionJobsService } from './signature-completion-jobs.service';

describe('SignatureCompletionJobsService', () => {
  const claim = {
    id: 5,
    idempotency_key: 'signature-completion-v1-11',
    organization_id: 3,
    document_id: 11,
    attempt_count: 1,
  };
  const repository = {
    claim: jest.fn(),
    snapshot: jest.fn(),
    complete: jest.fn(),
    fail: jest.fn(),
  } as unknown as jest.Mocked<SignatureCompletionJobsRepository>;
  const storage = {
    read: jest.fn(),
    store: jest.fn(),
    remove: jest.fn(),
  } as unknown as jest.Mocked<SignatureFileStorage>;
  const service = new SignatureCompletionJobsService(repository, storage);

  beforeEach(async () => {
    jest.resetAllMocks();
    const source = await PDFDocument.create();
    source.addPage([612, 792]);
    storage.read.mockResolvedValue(Buffer.from(await source.save()));
    storage.store.mockResolvedValue('/uploads/signatures/completed.pdf');
    repository.claim
      .mockResolvedValueOnce(claim)
      .mockResolvedValueOnce(null);
    repository.snapshot.mockResolvedValue({
      document: {
        id: 11,
        organization_id: 3,
        title: 'NDA',
        document_number: 'SIG-11',
        file_url: '/uploads/signatures/source.pdf',
        file_name: 'source.pdf',
        original_sha256: 'a'.repeat(64),
        signed_file_url: null,
      },
      fields: [{
        id: 17,
        field_type: 'text',
        page_number: 1,
        x_position: '10',
        y_position: '10',
        width: '50',
        height: '10',
        value: 'Signed value',
        font_size: 10,
      }],
      recipients: [{
        id: 7,
        contact_id: null,
        name: 'Signer',
        email: 'signer@example.com',
        signed_at: new Date('2026-07-23T00:00:00Z'),
      }],
      audit: [{
        event_type: 'signed',
        description: 'Recipient signed document',
        created_at: new Date('2026-07-23T00:00:00Z'),
      }],
      sender: { name: 'Owner', email: 'owner@example.com' },
    });
    repository.complete.mockResolvedValue(true);
  });

  it('generates and stores a signed PDF before fencing database completion', async () => {
    await expect(service.run()).resolves.toEqual({
      claimed: 1,
      completed: 1,
      retry: 0,
      deadLetter: 0,
      stale: 0,
    });
    expect(storage.store).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 3,
      resourceId: 11,
      scope: 'document',
    }));
    const completedBytes = storage.store.mock.calls[0][0].buffer;
    const completed = await PDFDocument.load(completedBytes);
    expect(completed.getPageCount()).toBe(2);
    expect(repository.complete).toHaveBeenCalledWith(
      claim,
      expect.objectContaining({
        fileUrl: '/uploads/signatures/completed.pdf',
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it('removes a generated artifact when the fenced completion is stale', async () => {
    repository.complete.mockResolvedValue(false);
    await expect(service.run({ jobId: claim.id })).resolves.toMatchObject({
      stale: 1,
    });
    expect(storage.remove).toHaveBeenCalledWith(
      '/uploads/signatures/completed.pdf',
    );
  });

  it('dead-letters a missing authoritative snapshot without touching storage', async () => {
    repository.snapshot.mockResolvedValue(null);
    repository.fail.mockResolvedValue('dead_letter');
    await expect(service.run({ jobId: claim.id })).resolves.toMatchObject({
      deadLetter: 1,
    });
    expect(storage.read).not.toHaveBeenCalled();
    expect(repository.fail).toHaveBeenCalledWith(
      claim,
      expect.any(Error),
      expect.objectContaining({ retryable: false }),
    );
  });
});
