import { InvoiceEmailPreviewService } from './invoice-email-preview.service';

describe('InvoiceEmailPreviewService', () => {
  const originalAssetOrigin = process.env.EMAIL_ASSET_ORIGIN;
  const originalNodeEnv = process.env.NODE_ENV;
  const service = new InvoiceEmailPreviewService();

  afterEach(() => {
    if (originalAssetOrigin === undefined) delete process.env.EMAIL_ASSET_ORIGIN;
    else process.env.EMAIL_ASSET_ORIGIN = originalAssetOrigin;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it('renders the branded transactional layout from the configured origin', () => {
    process.env.EMAIL_ASSET_ORIGIN = 'https://app.example.test/some/path';
    const result = service.preview({
      message: 'Hello\nInvoice attached.',
      subject: 'Invoice INV-00001',
      includePaymentLink: true,
    });
    expect(result.html).toContain('<title>Invoice INV-00001</title>');
    expect(result.html).toContain('Hello\nInvoice attached.');
    expect(result.html).toContain('https://app.example.test/cover.png');
    expect(result.html).toContain('Pay now');
    expect(result.html).toContain('height:4px;background:#2563eb');
    expect(result.html).not.toContain('Unsubscribe');
    expect(result.html).not.toContain('Your invoice PDF');
    expect(result.html).not.toContain('Sent securely with Itemize');
    expect(result.html).not.toContain('background:#f8fafc;border-top:1px');
  });

  it('treats user content as plain text and ignores unsafe configured URLs', () => {
    process.env.NODE_ENV = 'production';
    process.env.EMAIL_ASSET_ORIGIN = 'javascript:alert(1)';
    const result = service.preview({
      message: '<script>window.opener.pwned=true</script>',
      subject: '</title><script>alert(1)</script>',
      includePaymentLink: false,
    });
    expect(result.html).toContain('&lt;script&gt;window.opener.pwned=true&lt;/script&gt;');
    expect(result.html).toContain('&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(result.html).not.toContain('<script>alert(1)</script>');
    expect(result.html).toContain('https://itemize.cloud/cover.png');
    expect(result.html).not.toContain('Pay now');
  });

  it('rejects empty and oversized content with stable reasons', () => {
    expect(() => service.preview({ message: '   ', includePaymentLink: false }))
      .toThrow(expect.objectContaining({
        extensions: expect.objectContaining({ reason: 'EMPTY_INVOICE_EMAIL_MESSAGE' }),
      }));
    expect(() => service.preview({
      message: 'x'.repeat(50_001),
      includePaymentLink: false,
    })).toThrow(expect.objectContaining({
      extensions: expect.objectContaining({ reason: 'INVOICE_EMAIL_MESSAGE_TOO_LONG' }),
    }));
    expect(() => service.preview({
      message: 'Valid',
      subject: 'x'.repeat(256),
      includePaymentLink: false,
    })).toThrow(expect.objectContaining({
      extensions: expect.objectContaining({ reason: 'INVOICE_EMAIL_SUBJECT_TOO_LONG' }),
    }));
  });
});
