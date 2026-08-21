import { Injectable } from '@nestjs/common';
import {
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  rgb,
} from 'pdf-lib';
import {
  InvoicePdfRenderer,
  InvoicePdfSnapshot,
} from './invoice-delivery.providers';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 48;
const BLUE = rgb(37 / 255, 99 / 255, 235 / 255);
const INK = rgb(15 / 255, 23 / 255, 42 / 255);
const MUTED = rgb(100 / 255, 116 / 255, 139 / 255);
const BORDER = rgb(226 / 255, 232 / 255, 240 / 255);
const SURFACE = rgb(248 / 255, 250 / 255, 252 / 255);

const text = (value: unknown): string => String(value ?? '')
  .replace(/[–—]/g, '-')
  .replace(/[‘’]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/[^\x20-\x7E\n]/g, '')
  .trim();

const number = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const money = (value: unknown, currency: unknown): string => {
  const amount = number(value).toFixed(2);
  const code = text(currency || 'USD').toUpperCase();
  return code === 'USD' ? `$${amount}` : `${code} ${amount}`;
};

const date = (value: unknown): string => {
  const raw = text(value);
  if (!raw) return '-';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime())
    ? raw
    : parsed.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    });
};

const address = (value: unknown): string => {
  if (!value) return '';
  if (typeof value === 'string') return text(value);
  if (typeof value !== 'object') return text(value);
  const record = value as Record<string, unknown>;
  return [record.street, record.city, record.state, record.zip, record.country]
    .map(text)
    .filter(Boolean)
    .join(', ');
};

const wrap = (font: PDFFont, value: unknown, size: number, maxWidth: number): string[] => {
  const source = text(value);
  if (!source) return [];
  const lines: string[] = [];
  for (const paragraph of source.split(/\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
};

@Injectable()
export class PdfLibInvoiceRenderer implements InvoicePdfRenderer {
  async render(snapshot: InvoicePdfSnapshot): Promise<Buffer> {
    const document = await PDFDocument.create();
    document.setTitle(text(snapshot.invoice.invoice_number || 'Invoice'));
    document.setAuthor('Itemize');
    document.setCreator('Itemize');

    const regular = await document.embedFont(StandardFonts.Helvetica);
    const bold = await document.embedFont(StandardFonts.HelveticaBold);
    const invoice = snapshot.invoice;
    const currency = invoice.currency || 'USD';
    const business = (invoice.business || {}) as Record<string, unknown>;
    const businessName = text(business.name || snapshot.settings.business_name || 'Itemize');
    const items = Array.isArray(invoice.items) ? invoice.items as Array<Record<string, unknown>> : [];

    let page!: PDFPage;
    let y!: number;

    const addPage = (continuation = false) => {
      page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 6, width: PAGE_WIDTH, height: 6, color: BLUE });
      page.drawText('ITEMIZE', { x: MARGIN, y: PAGE_HEIGHT - 48, size: 18, font: bold, color: INK });
      page.drawText(continuation ? 'INVOICE - CONTINUED' : 'INVOICE', {
        x: PAGE_WIDTH - MARGIN - (continuation ? 132 : 64),
        y: PAGE_HEIGHT - 46,
        size: 11,
        font: bold,
        color: BLUE,
      });
      y = PAGE_HEIGHT - 82;
    };

    const ensure = (height: number, continuation = true) => {
      if (y - height < MARGIN) addPage(continuation);
    };

    const drawLines = (
      lines: string[],
      x: number,
      options: { size?: number; leading?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
    ) => {
      const size = options.size ?? 10;
      const leading = options.leading ?? size + 4;
      const selectedFont = options.font ?? regular;
      const selectedColor = options.color ?? INK;
      for (const line of lines) {
        ensure(leading);
        if (line) page.drawText(line, { x, y, size, font: selectedFont, color: selectedColor });
        y -= leading;
      }
    };

    const tableHeader = () => {
      ensure(34);
      page.drawRectangle({ x: MARGIN, y: y - 22, width: PAGE_WIDTH - MARGIN * 2, height: 30, color: SURFACE });
      page.drawText('ITEM', { x: MARGIN + 10, y: y - 11, size: 8, font: bold, color: MUTED });
      page.drawText('QTY', { x: 355, y: y - 11, size: 8, font: bold, color: MUTED });
      page.drawText('RATE', { x: 415, y: y - 11, size: 8, font: bold, color: MUTED });
      page.drawText('AMOUNT', { x: 500, y: y - 11, size: 8, font: bold, color: MUTED });
      y -= 34;
    };

    addPage();
    page.drawText(businessName, { x: MARGIN, y, size: 20, font: bold, color: INK });
    page.drawText(text(invoice.invoice_number || 'Invoice'), {
      x: PAGE_WIDTH - MARGIN - 110, y: y + 2, size: 12, font: bold, color: INK,
    });
    y -= 25;
    const businessContact = [business.email, business.phone, address(business.address)]
      .map(text).filter(Boolean).join(' | ');
    if (businessContact) drawLines(wrap(regular, businessContact, 9, 320), MARGIN, { size: 9, leading: 12, color: MUTED });

    y -= 22;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: BORDER });
    y -= 28;
    page.drawText('BILL TO', { x: MARGIN, y, size: 8, font: bold, color: MUTED });
    page.drawText('ISSUED', { x: 390, y, size: 8, font: bold, color: MUTED });
    page.drawText('DUE', { x: 500, y, size: 8, font: bold, color: MUTED });
    y -= 18;
    page.drawText(text(invoice.customer_name || 'Customer'), { x: MARGIN, y, size: 12, font: bold, color: INK });
    page.drawText(date(invoice.issue_date), { x: 390, y, size: 9, font: regular, color: INK });
    page.drawText(date(invoice.due_date), { x: 500, y, size: 9, font: regular, color: INK });
    y -= 15;
    drawLines(
      wrap(regular, [invoice.customer_email, invoice.customer_phone, address(invoice.customer_address)].map(text).filter(Boolean).join(' | '), 9, 300),
      MARGIN,
      { size: 9, leading: 12, color: MUTED },
    );

    y -= 25;
    tableHeader();
    for (const item of items) {
      const nameLines = wrap(bold, item.name || 'Line item', 9, 270);
      const descriptionLines = wrap(regular, item.description, 8, 270);
      const rowLines = Math.max(1, nameLines.length + descriptionLines.length);
      const rowHeight = Math.max(42, rowLines * 12 + 18);
      if (y - rowHeight < MARGIN + 120) {
        addPage(true);
        tableHeader();
      }
      const top = y;
      nameLines.forEach((line, index) => page.drawText(line, {
        x: MARGIN + 10, y: top - index * 12, size: 9, font: bold, color: INK,
      }));
      descriptionLines.forEach((line, index) => page.drawText(line, {
        x: MARGIN + 10,
        y: top - (nameLines.length + index) * 12,
        size: 8,
        font: regular,
        color: MUTED,
      }));
      const quantity = number(item.quantity);
      const rate = number(item.unit_price);
      page.drawText(String(quantity), { x: 355, y: top, size: 9, font: regular, color: INK });
      page.drawText(money(rate, currency), { x: 415, y: top, size: 9, font: regular, color: INK });
      page.drawText(money(quantity * rate, currency), { x: 500, y: top, size: 9, font: bold, color: INK });
      y -= rowHeight;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: BORDER });
      y -= 12;
    }

    ensure(135);
    const totalsX = 392;
    const totalRows: Array<[string, unknown, boolean]> = [
      ['Subtotal', invoice.subtotal, false],
      ['Tax', invoice.tax_amount, false],
      ['Discount', -number(invoice.discount_amount), false],
      ['Total', invoice.total, true],
      ['Amount due', invoice.amount_due ?? invoice.total, true],
    ];
    for (const [label, value, emphasized] of totalRows) {
      page.drawText(label, { x: totalsX, y, size: emphasized ? 10 : 9, font: emphasized ? bold : regular, color: emphasized ? INK : MUTED });
      const formatted = money(value, currency);
      page.drawText(formatted, {
        x: PAGE_WIDTH - MARGIN - bold.widthOfTextAtSize(formatted, emphasized ? 10 : 9),
        y,
        size: emphasized ? 10 : 9,
        font: emphasized ? bold : regular,
        color: INK,
      });
      y -= emphasized ? 21 : 17;
    }

    const notes = text(invoice.notes || snapshot.settings.default_notes);
    const terms = text(invoice.terms_and_conditions || snapshot.settings.default_terms);
    for (const [label, value] of [['NOTES', notes], ['TERMS', terms]] as const) {
      if (!value) continue;
      y -= 14;
      ensure(55);
      page.drawText(label, { x: MARGIN, y, size: 8, font: bold, color: MUTED });
      y -= 17;
      drawLines(wrap(regular, value, 9, PAGE_WIDTH - MARGIN * 2), MARGIN, { size: 9, leading: 13, color: INK });
    }

    for (const currentPage of document.getPages()) {
      currentPage.drawText('Created with Itemize', {
        x: MARGIN,
        y: 24,
        size: 7,
        font: regular,
        color: MUTED,
      });
    }

    return Buffer.from(await document.save());
  }
}
