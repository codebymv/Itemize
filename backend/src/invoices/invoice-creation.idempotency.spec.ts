import { invoiceCreationFingerprint, invoiceCreationKey } from './invoice-creation.idempotency';
import type { InvoiceValues } from './invoices.repository';

const values = (): InvoiceValues => ({
  contactId: null,
  businessId: null,
  customerName: 'Ada',
  customerEmail: 'ada@example.com',
  customerPhone: null,
  customerAddress: null,
  issueDate: null,
  dueDate: null,
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
  taxRate: '0.00',
  notes: null,
  termsAndConditions: null,
  paymentTerms: null,
});

describe('invoice creation idempotency', () => {
  it('canonicalizes object keys while preserving line-item order', () => {
    const original = values();
    const reorderedKeys = Object.fromEntries(Object.entries(original).reverse()) as InvoiceValues;
    const extraItem = { ...original.items[0], name: 'Expenses' };
    expect(invoiceCreationFingerprint(original)).toBe(invoiceCreationFingerprint(reorderedKeys));
    expect(invoiceCreationFingerprint({ ...original, items: [original.items[0], extraItem] }))
      .not.toBe(invoiceCreationFingerprint({ ...original, items: [extraItem, original.items[0]] }));
  });

  it('validates the browser key contract', () => {
    expect(invoiceCreationKey(' invoice:create-1 ')).toBe('invoice:create-1');
    expect(() => invoiceCreationKey('not safe')).toThrow();
  });
});
