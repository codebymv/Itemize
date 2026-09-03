import {
  contactCreationFingerprint,
  contactCreationKey,
} from './contact-creation.idempotency';
import type { ContactCreateValues } from './contacts.repository';

const values = (): ContactCreateValues => ({
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: null,
  company: 'Analytical Engines',
  jobTitle: null,
  address: { city: 'London', country: 'UK' },
  source: 'manual',
  status: 'active',
  customFields: { priority: 'high' },
  tags: ['vip'],
  assignedToId: null,
});

describe('contact creation idempotency', () => {
  it('canonicalizes nested object keys while preserving tag order', () => {
    const original = values();
    const reordered = {
      ...original,
      address: { country: 'UK', city: 'London' },
    };
    expect(contactCreationFingerprint(original))
      .toBe(contactCreationFingerprint(reordered));
    expect(contactCreationFingerprint({ ...original, tags: ['vip', 'lead'] }))
      .not.toBe(contactCreationFingerprint({ ...original, tags: ['lead', 'vip'] }));
  });

  it('validates the browser key contract', () => {
    expect(contactCreationKey(' contact:create-1 ')).toBe('contact:create-1');
    expect(() => contactCreationKey('not safe')).toThrow();
  });
});
