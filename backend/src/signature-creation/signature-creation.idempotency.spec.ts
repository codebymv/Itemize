import {
  signatureCreationFingerprint,
  signatureCreationKey,
} from './signature-creation.idempotency';

describe('signature creation idempotency', () => {
  it('canonicalizes object keys while preserving semantically ordered arrays', () => {
    const left = signatureCreationFingerprint('create_document', {
      title: 'NDA',
      recipients: [{ email: 'first@example.com' }, { email: 'second@example.com' }],
      routingMode: 'sequential',
    });
    const reorderedKeys = signatureCreationFingerprint('create_document', {
      routingMode: 'sequential',
      recipients: [{ email: 'first@example.com' }, { email: 'second@example.com' }],
      title: 'NDA',
    });
    const reorderedRecipients = signatureCreationFingerprint('create_document', {
      title: 'NDA',
      recipients: [{ email: 'second@example.com' }, { email: 'first@example.com' }],
      routingMode: 'sequential',
    });
    expect(left).toBe(reorderedKeys);
    expect(left).not.toBe(reorderedRecipients);
  });

  it('includes the action and validates the key contract', () => {
    expect(signatureCreationFingerprint('create_document', { title: 'NDA' }))
      .not.toBe(signatureCreationFingerprint('create_template', { title: 'NDA' }));
    expect(signatureCreationKey(' signature:create-1 ')).toBe('signature:create-1');
    expect(() => signatureCreationKey('contains spaces')).toThrow();
  });
});
