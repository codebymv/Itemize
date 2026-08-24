import {
  estimateDeliveryToken,
  estimateDeliveryTokenHash,
  estimatePublicTokenHash,
} from './estimate-public.token';

describe('public estimate capability tokens', () => {
  const previousDedicated = process.env.ESTIMATE_TOKEN_DERIVATION_KEY;
  const previousJwt = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.ESTIMATE_TOKEN_DERIVATION_KEY = 'estimate-test-derivation-key-32-bytes-long';
    delete process.env.JWT_SECRET;
  });

  afterAll(() => {
    if (previousDedicated === undefined) delete process.env.ESTIMATE_TOKEN_DERIVATION_KEY;
    else process.env.ESTIMATE_TOKEN_DERIVATION_KEY = previousDedicated;
    if (previousJwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousJwt;
  });

  it('derives a stable URL-safe token and stores only its hash', () => {
    const token = estimateDeliveryToken(3, 7, 'request-1');
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(estimateDeliveryToken(3, 7, 'request-1')).toBe(token);
    expect(estimateDeliveryToken(3, 8, 'request-1')).not.toBe(token);
    expect(estimateDeliveryTokenHash(3, 7, 'request-1')).toBe(estimatePublicTokenHash(token));
  });

  it('rejects malformed public tokens without hashing them', () => {
    expect(estimatePublicTokenHash('short')).toBeNull();
    expect(estimatePublicTokenHash('a'.repeat(31))).toBeNull();
  });
});
