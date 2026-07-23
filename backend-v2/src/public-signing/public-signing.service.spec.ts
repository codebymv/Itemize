import { GoneException } from '@nestjs/common';
import { PublicSigningRepository } from './public-signing.repository';
import { PublicSigningService } from './public-signing.service';
import { SignatureFileStorage } from '../signature-files/signature-file-storage.provider';

describe('PublicSigningService', () => {
  const head = jest.fn();
  const repository = {
    openSession: jest.fn(),
    file: jest.fn(),
    submit: jest.fn(),
    decline: jest.fn(),
  } as unknown as jest.Mocked<PublicSigningRepository>;
  const storage = {
    read: jest.fn(),
    head,
  } as unknown as jest.Mocked<SignatureFileStorage>;
  const service = new PublicSigningService(repository, storage);
  const audit = { ipAddress: '203.0.113.5', userAgent: 'browser', requestId: 'request-1' };
  const token = 'a'.repeat(64);

  beforeEach(() => {
    jest.clearAllMocks();
    head.mockResolvedValue({ totalLength: 9 });
  });

  it('returns a locator-free signing projection and recipient-owned fields', async () => {
    repository.openSession.mockResolvedValue({
      capability: {
        recipient_id: 7,
        recipient_name: 'Signer',
        recipient_email: 'signer@example.com',
        recipient_status: 'viewed',
        routing_status: 'active',
        signing_order: 1,
        identity_method: 'none',
        identity_verified_at: null,
        document_id: 11,
        organization_id: 3,
        title: 'NDA',
        description: null,
        message: 'Please sign',
        file_url: '/uploads/signatures/private.pdf',
        file_name: 'nda.pdf',
        file_type: 'application/pdf',
        original_sha256: 'a'.repeat(64),
        document_status: 'sent',
        expires_at: null,
        routing_mode: 'parallel',
        sender_name: 'Owner',
        sender_email: 'owner@example.com',
      },
      fields: [{
        id: 9,
        field_type: 'signature',
        page_number: 1,
        x_position: '10',
        y_position: '20',
        width: '30',
        height: '10',
        label: 'Sign',
        is_required: true,
        locked: false,
      }],
    });
    await expect(service.session(token, audit)).resolves.toEqual(
      expect.objectContaining({
        document: expect.objectContaining({
          file_url: '/api/public/sign/current/file',
        }),
        fields: [expect.objectContaining({ id: 9, x_position: 10 })],
      }),
    );
    expect(JSON.stringify(await service.session(token, audit)))
      .not.toContain('/uploads/signatures/private.pdf');
  });

  it('returns the same non-enumerating miss for malformed and unknown tokens', async () => {
    repository.openSession.mockResolvedValue(null);
    await expect(service.session('bad', audit)).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.session(token, audit)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('keeps verification unavailable and validates decline payloads', async () => {
    expect(() => service.verify()).toThrow(GoneException);
    await expect(service.decline(token, { reason: 'x'.repeat(2001) }, audit))
      .rejects.toMatchObject({ status: 400 });
    expect(repository.decline).not.toHaveBeenCalled();
  });

  it('reads only repository-authorized storage and applies safe filenames', async () => {
    repository.file.mockResolvedValue({
      fileUrl: '/uploads/signatures/private.pdf',
      fileName: 'unsafe\"name.pdf',
      originalSha256: 'a'.repeat(64),
    });
    storage.read.mockResolvedValue(Buffer.from('%PDF-file'));
    await expect(service.file(token)).resolves.toEqual({
      buffer: Buffer.from('%PDF-file'),
      filename: 'unsafe-name.pdf',
      etag: `"sha256-${'a'.repeat(64)}"`,
      notModified: false,
      range: null,
      totalLength: 9,
    });
  });
});
