import { renderSignatureDeliveryEmail } from './signature-delivery.email';
import { signatureDeliveryToken, signatureDeliveryTokenHash } from './signature-delivery.token';

describe('signature delivery capabilities and email rendering', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'signature-render-test-secret-at-least-32-characters';
    process.env.FRONTEND_URL = 'https://itemize.cloud/path-is-ignored';
  });

  it('derives stable, distinct capabilities without embedding the idempotency key', () => {
    const first = signatureDeliveryToken('request-1');
    expect(first).toBe(signatureDeliveryToken('request-1'));
    expect(first).not.toBe(signatureDeliveryToken('request-2'));
    expect(first).not.toContain('request-1');
    expect(signatureDeliveryTokenHash('request-1')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('normalizes an existing shorter JWT secret while enforcing a dedicated key length', () => {
    process.env.JWT_SECRET = 'existing-jwt-secret';
    expect(signatureDeliveryToken('request-1')).toBeTruthy();
    process.env.SIGNATURE_TOKEN_DERIVATION_KEY = 'too-short';
    expect(() => signatureDeliveryToken('request-1')).toThrow(
      'SIGNATURE_TOKEN_DERIVATION_KEY must be at least 32 characters',
    );
    delete process.env.SIGNATURE_TOKEN_DERIVATION_KEY;
  });

  it('escapes payload content and renders a server-controlled signing origin', () => {
    const rendered = renderSignatureDeliveryEmail('signature_request', 'request-1', {
      to: 'signer@example.com',
      recipientName: '<script>Signer</script>',
      documentTitle: '<b>NDA</b>',
      senderName: 'Alice & Bob',
      senderEmail: null,
      message: 'Please <img src=x onerror=alert(1)> sign',
      expiresAt: '2026-08-01T00:00:00.000Z',
    });
    expect(rendered.subject).toBe('Alice & Bob wants your signature');
    expect(rendered.html).toContain('Please &lt;img src=x onerror=alert(1)&gt; sign');
    expect(rendered.html).toContain('Document: &lt;b&gt;NDA&lt;/b&gt;');
    expect(rendered.html).toContain(`https://itemize.cloud/sign/${signatureDeliveryToken('request-1')}`);
    expect(rendered.html).not.toContain('<img');
    expect(rendered.html).not.toContain('<script>');
  });

  it.each([
    ['signer_completed', 'Signature received'],
    ['document_completed', 'Document completed'],
    ['signature_declined', 'Signature declined'],
  ] as const)('escapes %s notification content without creating a capability link', (type, heading) => {
    const rendered = renderSignatureDeliveryEmail(type, 'notification-1', {
      to: 'owner@example.com',
      recipientName: '<img src=x onerror=alert(1)>',
      documentTitle: '<script>NDA</script>',
      senderName: 'Owner',
      senderEmail: 'owner@example.com',
      message: '<a href=javascript:alert(1)>reason</a>',
      expiresAt: null,
    });
    expect(rendered.html).toContain(heading);
    expect(rendered.html).toContain('&lt;script&gt;NDA&lt;/script&gt;');
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).not.toContain('<img');
    expect(rendered.html).not.toContain('/sign/');
  });
});
