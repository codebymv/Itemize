import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import {
  InvoicePdfBrandAssets,
  InvoicePdfImageAsset,
} from './invoice-pdf-brand-assets';
import { PdfLibInvoiceRenderer } from './invoice-pdf.renderer';

class FixtureAssets extends InvoicePdfBrandAssets {
  private readonly base = new InvoicePdfBrandAssets();

  override fonts() {
    return this.base.fonts();
  }

  override async itemize() {
    return {
      icon: await this.png('frontend/public/icon.png'),
      wordmark: await this.png('frontend/public/textblack.png'),
    };
  }

  override businessLogo() {
    return this.png('frontend/public/icon.png');
  }

  private async png(path: string): Promise<InvoicePdfImageAsset> {
    return {
      bytes: await readFile(resolve(__dirname, '../../../', path)),
      format: 'png',
    };
  }
}

const snapshot = (itemCount = 1) => ({
  invoice: {
    invoice_number: 'INV-00001',
    issue_date: '2026-08-21',
    due_date: '2026-09-20',
    customer_name: 'Ada Lovelace',
    customer_email: 'ada@example.com',
    customer_address: '123 Analytical Engine Way\nLondon',
    currency: 'USD',
    subtotal: itemCount * 125,
    tax_amount: 12.5,
    discount_amount: 0,
    total: itemCount * 125 + 12.5,
    amount_due: itemCount * 125 + 12.5,
    notes: 'Thank you — this dash and José are preserved.',
    terms_and_conditions: 'Payment is due according to the schedule above.',
    items: Array.from({ length: itemCount }, (_, index) => ({
      name: `Production consulting ${index + 1}`,
      description: 'Release-readiness work with a clear, customer-facing description.',
      quantity: 1,
      unit_price: 125,
    })),
    business: {
      name: 'Itemize Studio',
      email: 'owner@example.com',
      address: '456 Product Road\nPhoenix, AZ 85001',
      logo_url: 'fixture://business-logo',
    },
  },
  settings: {},
});

describe('PdfLibInvoiceRenderer', () => {
  const renderer = new PdfLibInvoiceRenderer(new FixtureAssets());

  it('renders the branded invoice with embedded fonts and image assets', async () => {
    const buffer = await renderer.render(snapshot());

    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(20_000);
    const document = await PDFDocument.load(buffer);
    expect(document.getPageCount()).toBe(1);
    expect(document.getTitle()).toBe('INV-00001');
    expect(document.getAuthor()).toBe('Itemize');
    const resources = document.getPage(0).node.Resources();
    expect(resources).toBeDefined();
    expect(resources!.lookup(PDFName.of('Font'), PDFDict).keys().length)
      .toBeGreaterThanOrEqual(3);
    expect(resources!.lookup(PDFName.of('XObject'), PDFDict).keys().length)
      .toBeGreaterThanOrEqual(3);
  });

  it('keeps the branded continuation treatment across long invoices', async () => {
    const buffer = await renderer.render(snapshot(36));
    const document = await PDFDocument.load(buffer);

    expect(document.getPageCount()).toBeGreaterThan(1);
    for (const page of document.getPages()) {
      expect(page.getWidth()).toBe(612);
      expect(page.getHeight()).toBe(792);
    }
  });
});
