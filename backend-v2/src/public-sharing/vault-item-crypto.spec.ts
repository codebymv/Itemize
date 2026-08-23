import {
  decryptVaultItemValue,
  encryptVaultItemValue,
} from './vault-item-crypto';

describe('vault item crypto', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env.VAULT_ENCRYPTION_KEY = originalEnv.VAULT_ENCRYPTION_KEY;
    process.env.NODE_ENV = originalEnv.NODE_ENV;
    process.env.JWT_SECRET = originalEnv.JWT_SECRET;
    if (originalEnv.VAULT_ENCRYPTION_KEY === undefined) {
      delete process.env.VAULT_ENCRYPTION_KEY;
    }
  });

  it('round-trips a value with a configured 64-hex key', () => {
    process.env.VAULT_ENCRYPTION_KEY = 'ab'.repeat(32);
    const { encrypted, iv } = encryptVaultItemValue('secret value');
    expect(decryptVaultItemValue(encrypted, iv)).toBe('secret value');
  });

  it('fails closed on tampered ciphertext', () => {
    process.env.VAULT_ENCRYPTION_KEY = 'ab'.repeat(32);
    const { encrypted, iv } = encryptVaultItemValue('secret value');
    const tampered = Buffer.from(encrypted, 'base64');
    tampered[0] ^= 0xff;
    expect(() =>
      decryptVaultItemValue(tampered.toString('base64'), iv),
    ).toThrow('Failed to decrypt data');
  });

  it('fails closed on garbage input', () => {
    process.env.VAULT_ENCRYPTION_KEY = 'ab'.repeat(32);
    expect(() => decryptVaultItemValue('invalid', 'invalid')).toThrow(
      'Failed to decrypt data',
    );
  });

  it('rejects keys that are not 64 hex characters', () => {
    process.env.VAULT_ENCRYPTION_KEY = 'short';
    expect(() => encryptVaultItemValue('x')).toThrow(
      'VAULT_ENCRYPTION_KEY must be exactly 64 hex characters',
    );
  });

  it('requires the key in production', () => {
    delete process.env.VAULT_ENCRYPTION_KEY;
    process.env.NODE_ENV = 'production';
    expect(() => encryptVaultItemValue('x')).toThrow(
      'VAULT_ENCRYPTION_KEY environment variable is required in production',
    );
  });

  it('derives a JWT_SECRET fallback key outside production', () => {
    delete process.env.VAULT_ENCRYPTION_KEY;
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'fallback-secret';
    const { encrypted, iv } = encryptVaultItemValue('secret value');
    expect(decryptVaultItemValue(encrypted, iv)).toBe('secret value');
  });
});
