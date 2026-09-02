import {
  estimateCreationFingerprint,
  estimateCreationKey,
} from './estimate-creation.idempotency';
import type { EstimateValues } from './estimates.repository';

const values = (): EstimateValues => ({
  contactId: null,
  customerName: 'Ada',
  customerEmail: 'ada@example.com',
  customerPhone: null,
  customerAddress: null,
  validUntil: '2026-10-01',
  items: [{
    productId: null,
    name: 'Consulting',
    description: null,
    quantity: '1.00',
    unitPrice: '100.00',
    taxRate: '0.00',
  }],
  discountType: null,
  discountValue: '0.00',
  notes: null,
  termsAndConditions: null,
});

describe('estimate creation idempotency', () => {
  it('canonicalizes object keys while preserving line-item order', () => {
    const original = values();
    const reorderedKeys = Object.fromEntries(
      Object.entries(original).reverse(),
    ) as EstimateValues;
    const extraItem = { ...original.items[0], name: 'Expenses' };

    expect(estimateCreationFingerprint(original))
      .toBe(estimateCreationFingerprint(reorderedKeys));
    expect(estimateCreationFingerprint({
      ...original,
      items: [original.items[0], extraItem],
    })).not.toBe(estimateCreationFingerprint({
      ...original,
      items: [extraItem, original.items[0]],
    }));
  });

  it('validates the browser key contract', () => {
    expect(estimateCreationKey(' estimate:create-1 ')).toBe('estimate:create-1');
    expect(() => estimateCreationKey('not safe')).toThrow();
  });
});
