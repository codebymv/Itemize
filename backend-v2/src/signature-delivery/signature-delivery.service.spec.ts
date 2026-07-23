import { SignatureDeliveryRepository } from './signature-delivery.repository';
import { SignatureDeliveryService } from './signature-delivery.service';

describe('SignatureDeliveryService', () => {
  const repository = { hasFeatureAccess: jest.fn() } as unknown as jest.Mocked<SignatureDeliveryRepository>;
  const service = new SignatureDeliveryService(repository);

  beforeEach(() => {
    jest.clearAllMocks();
    repository.hasFeatureAccess.mockResolvedValue(true);
  });

  it('renders a bounded server-controlled preview and escapes user content', async () => {
    const preview = await service.preview(3, {
      message: 'Please <script>alert(1)</script> sign',
      documentTitle: '<b>NDA</b>',
      senderName: 'Alice & Bob',
      expiresAt: new Date('2026-08-01T23:00:00-07:00'),
    });

    expect(preview.subject).toBe('Alice & Bob wants your signature');
    expect(preview.html).toContain('Please &lt;script&gt;alert(1)&lt;/script&gt; sign');
    expect(preview.html).toContain('Document: &lt;b&gt;NDA&lt;/b&gt;');
    expect(preview.html).toContain('Expires on August 2, 2026');
    expect(preview.html).toContain('http://localhost:5173/sign/preview');
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
