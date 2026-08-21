import { PDFDocument } from 'pdf-lib';
import { PdfLibInvoiceRenderer } from './invoice-pdf.renderer';

describe('PdfLibInvoiceRenderer', () => {
  it('renders a self-contained branded invoice without legacy runtime files', async () => {
    const buffer = await new PdfLibInvoiceRenderer().render({
      invoice: {
        invoice_number: 'INV-00001',
        issue_date: '2026-08-21',
        due_date: '2026-09-20',
        customer_name: 'Ada Lovelace',
        customer_email: 'ada@example.com',
        currency: 'USD',
        subtotal: 125,
        tax_amount: 0,
        discount_amount: 0,
        total: 125,
        amount_due: 125,
        notes: 'Thank you — this dash is normalized.',
        items: [{
          name: 'Production consulting',
          description: 'Release-readiness work',
          quantity: 1,
          unit_price: 125,
        }],
        business: { name: 'Itemize Studio', email: 'owner@example.com' },
      },
      settings: {},
    });

    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(1_000);
    const document = await PDFDocument.load(buffer);
    expect(document.getPageCount()).toBe(1);
    expect(document.getTitle()).toBe('INV-00001');
    expect(document.getAuthor()).toBe('Itemize');
  });
});
