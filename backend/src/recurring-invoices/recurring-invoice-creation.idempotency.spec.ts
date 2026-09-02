import {
  recurringInvoiceCloneFingerprint,
  recurringInvoiceCreationFingerprint,
  recurringInvoiceCreationKey,
} from './recurring-invoice-creation.idempotency';
import type { RecurringInvoiceValues } from './recurring-invoices.repository';

const values = (): RecurringInvoiceValues => ({
  templateName: 'Monthly care',
  contactId: null,
  customerName: 'Ada',
  customerEmail: 'ada@example.com',
  frequency: 'monthly',
  startDate: '2026-10-01',
  endDate: null,
  items: [{
    productId: null,
    name: 'Care plan',
    description: null,
    quantity: '1.00',
    unitPrice: '100.00',
    taxRate: '0.00',
  }],
  discountType: null,
  discountValue: '0.00',
  notes: null,
  paymentTerms: null,
});

describe('recurring invoice creation idempotency', () => {
  it('canonicalizes keys, preserves item order, and separates creation paths', () => {
    const original = values();
    const reordered = Object.fromEntries(
      Object.entries(original).reverse(),
    ) as RecurringInvoiceValues;
    const extra = { ...original.items[0], name: 'Expenses' };

    expect(recurringInvoiceCreationFingerprint(original))
      .toBe(recurringInvoiceCreationFingerprint(reordered));
    expect(recurringInvoiceCreationFingerprint({
      ...original,
      items: [original.items[0], extra],
    })).not.toBe(recurringInvoiceCreationFingerprint({
      ...original,
      items: [extra, original.items[0]],
    }));
    expect(recurringInvoiceCreationFingerprint(original)).not.toBe(
      recurringInvoiceCloneFingerprint(4, {
        templateName: original.templateName,
        frequency: original.frequency,
        startDate: original.startDate,
        endDate: original.endDate,
      }),
    );
  });

  it('validates the browser key contract', () => {
    expect(recurringInvoiceCreationKey(' recurring:create-1 '))
      .toBe('recurring:create-1');
    expect(() => recurringInvoiceCreationKey('not safe')).toThrow();
  });
});
