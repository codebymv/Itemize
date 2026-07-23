import {
  normalizePublicSigningSubmission,
  publicSigningTokenHash,
  validatePublicSigningFieldValue,
} from './public-signing.validation';

const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZC3sAAAAASUVORK5CYII=';

describe('public signing validation', () => {
  it('accepts legacy and derived capability alphabets without echoing token material', () => {
    expect(publicSigningTokenHash('a'.repeat(64))).toMatch(/^[a-f0-9]{64}$/);
    expect(publicSigningTokenHash('a_B-c'.repeat(8))).toMatch(/^[a-f0-9]{64}$/);
    expect(publicSigningTokenHash('short')).toBeNull();
    expect(publicSigningTokenHash('a'.repeat(31) + '/')).toBeNull();
  });

  it('requires an exact bounded fields payload with unique positive IDs', () => {
    expect(normalizePublicSigningSubmission({
      fields: [{ id: 1, value: 'yes' }],
    })).toEqual([{ id: 1, value: 'yes' }]);
    expect(() => normalizePublicSigningSubmission({
      fields: [{ id: 1, value: 'yes' }, { id: 1, value: 'again' }],
    })).toThrow('must be unique');
    expect(() => normalizePublicSigningSubmission({
      fields: [], extra: true,
    })).toThrow('only a fields array');
    expect(() => normalizePublicSigningSubmission({
      fields: [{ id: 0, value: '' }],
    })).toThrow('is invalid');
  });

  it('enforces type-specific required semantics and calendar dates', () => {
    expect(() => validatePublicSigningFieldValue(
      'checkbox', 'false', true, { bytes: 0 },
    )).toThrow('must be checked');
    expect(validatePublicSigningFieldValue(
      'checkbox', 'true', true, { bytes: 0 },
    )).toBe('true');
    expect(validatePublicSigningFieldValue(
      'date', '2028-02-29', true, { bytes: 0 },
    )).toBe('2028-02-29');
    expect(() => validatePublicSigningFieldValue(
      'date', '2027-02-29', true, { bytes: 0 },
    )).toThrow('YYYY-MM-DD');
    expect(() => validatePublicSigningFieldValue(
      'text', '   ', true, { bytes: 0 },
    )).toThrow('Missing required');
  });

  it('accepts a structurally complete PNG and rejects forged image prefixes', () => {
    const budget = { bytes: 0 };
    expect(validatePublicSigningFieldValue('signature', png, true, budget)).toBe(png);
    expect(budget.bytes).toBeGreaterThan(0);
    const forged = `data:image/png;base64,${Buffer.from('not a png').toString('base64')}`;
    expect(() => validatePublicSigningFieldValue(
      'signature', forged, true, { bytes: 0 },
    )).toThrow('content is invalid');
  });
});
