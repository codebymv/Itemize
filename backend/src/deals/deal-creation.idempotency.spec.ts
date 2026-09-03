import {
  dealCreationFingerprint,
  dealCreationKey,
} from './deal-creation.idempotency';
import type { DealValues } from './deals.repository';

const values = (): DealValues => ({
  pipelineId: 4,
  contactId: 11,
  stageId: 'qualified',
  title: 'Expansion',
  value: '1250.50',
  currency: 'USD',
  probability: 40,
  expectedCloseDate: '2026-10-01',
  assignedToId: 7,
  customFields: { region: 'west', priority: 'high' },
  tags: ['renewal'],
});

describe('deal creation idempotency', () => {
  it('canonicalizes nested object keys while preserving tag order', () => {
    const original = values();
    const reordered = {
      ...original,
      customFields: { priority: 'high', region: 'west' },
    };
    expect(dealCreationFingerprint(original))
      .toBe(dealCreationFingerprint(reordered));
    expect(dealCreationFingerprint({ ...original, tags: ['renewal', 'vip'] }))
      .not.toBe(dealCreationFingerprint({ ...original, tags: ['vip', 'renewal'] }));
  });

  it('validates the browser key contract', () => {
    expect(dealCreationKey(' deal:create-1 ')).toBe('deal:create-1');
    expect(() => dealCreationKey('not safe')).toThrow();
  });
});
