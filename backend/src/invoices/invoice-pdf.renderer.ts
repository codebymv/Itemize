import { Injectable } from '@nestjs/common';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb } from 'pdf-lib';
import {
  InvoicePdfRenderer,
  InvoicePdfSnapshot,
} from './invoice-delivery.providers';
import {
  InvoicePdfBrandAssets,
  InvoicePdfImageAsset,
} from './invoice-pdf-brand-assets';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_BOTTOM = 24;
const FOOTER_HEIGHT = 48;
const CONTENT_BOTTOM = 96;

const TOKENS = {
  primary: rgb(37 / 255, 99 / 255, 235 / 255),
  foreground: rgb(15 / 255, 23 / 255, 42 / 255),
  body: rgb(51 / 255, 65 / 255, 85 / 255),
  muted: rgb(100 / 255, 116 / 255, 139 / 255),
  border: rgb(226 / 255, 232 / 255, 240 / 255),
  surfaceMuted: rgb(248 / 255, 250 / 255, 252 / 255),
  white: rgb(1, 1, 1),
};

const text = (value: unknown): string => String(value ?? '')
  .replace(/\r\n?/g, '\n')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  .trim();

const number = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const money = (value: unknown, currency: unknown): string => {
  const code = text(currency || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: code, minimumFractionDigits: 2,
    }).format(number(value));
  } catch {
    return `${code} ${number(value).toFixed(2)}`;
  }
};

const date = (value: unknown): string => {
  const raw = text(value);
  if (!raw) return '-';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime())
    ? raw
    : parsed.toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    });
};

const address = (value: unknown): string => {
  if (!value) return '';
  if (typeof value === 'string') return text(value);
  if (typeof value !== 'object') return text(value);
  const record = value as Record<string, unknown>;
  const cityLine = [record.city, record.state, record.zip].map(text).filter(Boolean).join(', ');
  return [record.street, cityLine, record.country].map(text).filter(Boolean).join('\n');
};

const splitWord = (font: PDFFont, word: string, size: number, maxWidth: number): string[] => {
  const parts: string[] = [];
  let current = '';
  for (const character of word) {
    const candidate = current + character;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      parts.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current) parts.push(current);
  return parts;
};

const wrap = (font: PDFFont, value: unknown, size: number, maxWidth: number): string[] => {
  const source = text(value);
  if (!source) return [];
  const lines: string[] = [];
  for (const paragraph of source.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const sourceWord of words) {
      const wordParts = font.widthOfTextAtSize(sourceWord, size) > maxWidth
        ? splitWord(font, sourceWord, size, maxWidth)
        : [sourceWord];
      for (const word of wordParts) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
          line = candidate;
        } else {
          if (line) lines.push(line);
          line = word;
        }
      }
    }
    if (line) lines.push(line);
  }
  return lines;
};

const drawRight = (
  page: PDFPage,
  value: string,
  right: number,
  y: number,
  font: PDFFont,
  size: number,
  color = TOKENS.foreground,
) => {
  page.drawText(value, {
    x: right - font.widthOfTextAtSize(value, size), y, font, size, color,
  });
};

@Injectable()
export class PdfLibInvoiceRenderer implements InvoicePdfRenderer {
  constructor(private readonly assets: InvoicePdfBrandAssets = new InvoicePdfBrandAssets()) {}

  async render(snapshot: InvoicePdfSnapshot): Promise<Buffer> {
    const document = await PDFDocument.create();
    document.registerFontkit(fontkit);
    document.setTitle(text(snapshot.invoice.invoice_number || 'Invoice'));
    document.setAuthor('Itemize');
    document.setCreator('Itemize');

    const invoice = snapshot.invoice;
    const settings = snapshot.settings || {};
    const business = (invoice.business || {}) as Record<string, unknown>;
    const businessName = text(business.name || settings.business_name || 'Itemize');
    const currency = invoice.currency || 'USD';
    const items = Array.isArray(invoice.items)
      ? invoice.items as Array<Record<string, unknown>> : [];
    const [fontAssets, itemizeAssets, businessLogoAsset] = await Promise.all([
      this.assets.fonts(),
      this.assets.itemize(),
      this.assets.businessLogo(business.logo_url || settings.logo_url),
    ]);
    const regular = await document.embedFont(fontAssets.regular, { subset: true });
    const semibold = await document.embedFont(fontAssets.semibold, { subset: true });
    const bold = await document.embedFont(fontAssets.bold, { subset: true });
    const itemizeIcon = await this.embedImage(document, itemizeAssets.icon);
    const itemizeWordmark = await this.embedImage(document, itemizeAssets.wordmark);
    const businessLogo = await this.embedImage(document, businessLogoAsset);

    let page!: PDFPage;
    let y = 0;
    let pageNumber = 0;

    const drawFooter = (target: PDFPage) => {
      target.drawRectangle({
        x: MARGIN, y: FOOTER_BOTTOM, width: CONTENT_WIDTH, height: FOOTER_HEIGHT,
        color: TOKENS.primary,
      });
      const cardWidth = 112;
      const cardHeight = 30;
      const groupWidth = 176;
      const groupX = MARGIN + (CONTENT_WIDTH - groupWidth) / 2;
      const cardX = groupX + 64;
      target.drawText('Powered by', {
        x: groupX, y: FOOTER_BOTTOM + 19, size: 8, font: regular, color: TOKENS.white,
      });
      target.drawRectangle({
        x: cardX, y: FOOTER_BOTTOM + 9, width: cardWidth, height: cardHeight,
        color: TOKENS.white,
      });
      if (itemizeIcon) {
        const dimensions = itemizeIcon.scale(1);
        const height = 17;
        const width = height * dimensions.width / dimensions.height;
        target.drawImage(itemizeIcon, {
          x: cardX + 10, y: FOOTER_BOTTOM + 15, width, height,
        });
      }
      if (itemizeWordmark) {
        const dimensions = itemizeWordmark.scale(1);
        const height = 14;
        const width = Math.min(65, height * dimensions.width / dimensions.height);
        target.drawImage(itemizeWordmark, {
          x: cardX + 39, y: FOOTER_BOTTOM + 17, width, height,
        });
      } else {
        target.drawText('ITEMIZE', {
          x: cardX + 40, y: FOOTER_BOTTOM + 18, size: 11,
          font: semibold, color: TOKENS.foreground,
        });
      }
    };

    const addPage = (continuation = false) => {
      page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      pageNumber += 1;
      page.drawRectangle({
        x: 0, y: PAGE_HEIGHT - 4, width: PAGE_WIDTH, height: 4, color: TOKENS.primary,
      });
      drawFooter(page);
      if (continuation) {
        page.drawText(businessName, {
          x: MARGIN, y: PAGE_HEIGHT - 44, size: 11, font: semibold, color: TOKENS.foreground,
        });
        drawRight(page, 'INVOICE - CONTINUED', PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 44,
          semibold, 9, TOKENS.primary);
        page.drawText(`Page ${pageNumber}`, {
          x: MARGIN, y: FOOTER_BOTTOM + FOOTER_HEIGHT + 8,
          size: 7, font: regular, color: TOKENS.muted,
        });
        y = PAGE_HEIGHT - 78;
      } else {
        y = PAGE_HEIGHT - 54;
      }
    };

    const ensure = (height: number) => {
      if (y - height < CONTENT_BOTTOM) addPage(true);
    };

    const drawLines = (
      lines: string[],
      x: number,
      options: {
        size?: number;
        leading?: number;
        font?: PDFFont;
        color?: typeof TOKENS.foreground;
      } = {},
    ) => {
      const size = options.size ?? 10;
      const leading = options.leading ?? size + 4;
      const selectedFont = options.font ?? regular;
      const selectedColor = options.color ?? TOKENS.foreground;
      for (const line of lines) {
        ensure(leading);
        if (line) page.drawText(line, { x, y, size, font: selectedFont, color: selectedColor });
        y -= leading;
      }
    };

    const tableHeader = () => {
      ensure(31);
      page.drawText('DESCRIPTION', {
        x: MARGIN, y, size: 8, font: semibold, color: TOKENS.muted,
      });
      drawRight(page, 'QTY', 382, y, semibold, 8, TOKENS.muted);
      drawRight(page, 'UNIT PRICE', 476, y, semibold, 8, TOKENS.muted);
      drawRight(page, 'AMOUNT', PAGE_WIDTH - MARGIN, y, semibold, 8, TOKENS.muted);
      y -= 13;
      page.drawLine({
        start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y },
        thickness: 1.5, color: TOKENS.border,
      });
      y -= 18;
    };

    addPage();
    let businessY = PAGE_HEIGHT - 54;
    if (businessLogo) {
      const dimensions = businessLogo.scale(1);
      const scale = Math.min(148 / dimensions.width, 42 / dimensions.height, 1);
      const width = dimensions.width * scale;
      const height = dimensions.height * scale;
      page.drawImage(businessLogo, {
        x: MARGIN, y: businessY - height + 4, width, height,
      });
      businessY -= height + 10;
    }
    page.drawText(businessName, {
      x: MARGIN, y: businessY, size: 12, font: semibold, color: TOKENS.foreground,
    });
    businessY -= 16;
    const businessDetails = [
      business.address || settings.business_address,
      business.email || settings.business_email,
      business.phone || settings.business_phone,
    ].map(text).filter(Boolean).join('\n');
    for (const line of wrap(regular, businessDetails, 8.5, 255)) {
      page.drawText(line, {
        x: MARGIN, y: businessY, size: 8.5, font: regular, color: TOKENS.muted,
      });
      businessY -= 12;
    }
    drawRight(page, 'INVOICE', PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 56,
      regular, 25, TOKENS.primary);
    drawRight(page, text(invoice.invoice_number || 'Invoice'), PAGE_WIDTH - MARGIN,
      PAGE_HEIGHT - 78, regular, 10, TOKENS.muted);
    y = Math.min(businessY, PAGE_HEIGHT - 126) - 24;

    page.drawText('BILL TO', {
      x: MARGIN, y, size: 8, font: semibold, color: TOKENS.muted,
    });
    const partyTop = y - 18;
    page.drawText(text(invoice.customer_name || 'Customer'), {
      x: MARGIN, y: partyTop, size: 11, font: semibold, color: TOKENS.foreground,
    });
    let customerY = partyTop - 16;
    const customerDetails = [
      invoice.customer_email,
      invoice.customer_phone,
      address(invoice.customer_address),
    ].map(text).filter(Boolean).join('\n');
    for (const line of wrap(regular, customerDetails, 9, 265)) {
      page.drawText(line, {
        x: MARGIN, y: customerY, size: 9, font: regular, color: TOKENS.muted,
      });
      customerY -= 13;
    }

    const dateLabelRight = 466;
    const dateValueRight = PAGE_WIDTH - MARGIN;
    page.drawText('Issue Date:', {
      x: dateLabelRight - regular.widthOfTextAtSize('Issue Date:', 9),
      y: partyTop, size: 9, font: regular, color: TOKENS.muted,
    });
    drawRight(page, date(invoice.issue_date || invoice.created_at), dateValueRight,
      partyTop, semibold, 9, TOKENS.foreground);
    page.drawText('Due Date:', {
      x: dateLabelRight - regular.widthOfTextAtSize('Due Date:', 9),
      y: partyTop - 18, size: 9, font: regular, color: TOKENS.muted,
    });
    drawRight(page, date(invoice.due_date), dateValueRight,
      partyTop - 18, semibold, 9, TOKENS.foreground);
    y = Math.min(customerY, partyTop - 42) - 24;

    tableHeader();
    for (const item of items) {
      const nameLines = wrap(semibold, item.name || 'Line item', 9.5, 278);
      const descriptionLines = wrap(regular, item.description, 8, 278);
      const rowHeight = Math.max(36, (nameLines.length + descriptionLines.length) * 12 + 14);
      if (y - rowHeight < CONTENT_BOTTOM + 118) {
        addPage(true);
        tableHeader();
      }
      const top = y;
      nameLines.forEach((line, index) => page.drawText(line, {
        x: MARGIN, y: top - index * 12, size: 9.5, font: semibold, color: TOKENS.foreground,
      }));
      descriptionLines.forEach((line, index) => page.drawText(line, {
        x: MARGIN, y: top - (nameLines.length + index) * 12,
        size: 8, font: regular, color: TOKENS.muted,
      }));
      const quantity = number(item.quantity);
      const rate = number(item.unit_price);
      drawRight(page, String(quantity), 382, top, regular, 9, TOKENS.body);
      drawRight(page, money(rate, currency), 476, top, regular, 9, TOKENS.body);
      drawRight(page, money(quantity * rate, currency), PAGE_WIDTH - MARGIN,
        top, regular, 9, TOKENS.body);
      y -= rowHeight;
      page.drawLine({
        start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y },
        thickness: 1, color: TOKENS.border,
      });
      y -= 18;
    }

    ensure(142);
    const totalsLeft = 370;
    const totalsRight = PAGE_WIDTH - MARGIN;
    const totalRows: Array<[string, number]> = [['Subtotal', number(invoice.subtotal)]];
    if (number(invoice.tax_amount) > 0) totalRows.push(['Tax', number(invoice.tax_amount)]);
    if (number(invoice.discount_amount) > 0) {
      totalRows.push(['Discount', -number(invoice.discount_amount)]);
    }
    for (const [label, value] of totalRows) {
      page.drawText(label, { x: totalsLeft, y, size: 9, font: regular, color: TOKENS.body });
      drawRight(page, money(value, currency), totalsRight, y, regular, 9, TOKENS.body);
      y -= 18;
    }
    page.drawLine({
      start: { x: totalsLeft, y: y + 3 }, end: { x: totalsRight, y: y + 3 },
      thickness: 1, color: TOKENS.border,
    });
    y -= 16;
    page.drawText('Total', {
      x: totalsLeft, y, size: 14, font: bold, color: TOKENS.foreground,
    });
    drawRight(page, money(invoice.total, currency), totalsRight, y,
      bold, 14, TOKENS.foreground);
    y -= 23;
    const amountPaid = number(invoice.amount_paid);
    if (amountPaid > 0) {
      page.drawText('Paid', { x: totalsLeft, y, size: 9, font: regular, color: TOKENS.muted });
      drawRight(page, money(-amountPaid, currency), totalsRight, y, regular, 9, TOKENS.muted);
      y -= 18;
      page.drawText('Amount Due', {
        x: totalsLeft, y, size: 10, font: semibold, color: TOKENS.foreground,
      });
      drawRight(page, money(invoice.amount_due ?? invoice.total, currency), totalsRight,
        y, semibold, 10, TOKENS.foreground);
      y -= 22;
    }

    const notes = text(invoice.notes || settings.default_notes);
    if (notes) {
      const noteLines = wrap(regular, notes, 9, CONTENT_WIDTH - 28);
      const noteHeight = Math.max(48, noteLines.length * 13 + 29);
      ensure(noteHeight + 20);
      page.drawRectangle({
        x: MARGIN, y: y - noteHeight + 8, width: CONTENT_WIDTH, height: noteHeight,
        color: TOKENS.surfaceMuted, borderColor: TOKENS.border, borderWidth: 0.75,
      });
      page.drawText('NOTES', {
        x: MARGIN + 14, y: y - 8, size: 8, font: semibold, color: TOKENS.muted,
      });
      y -= 27;
      drawLines(noteLines, MARGIN + 14, {
        size: 9, leading: 13, font: regular, color: TOKENS.body,
      });
      y -= 14;
    }

    const terms = text(invoice.terms_and_conditions || settings.default_terms)
      || 'Thank you for your business!';
    const taxId = text(business.tax_id || settings.tax_id);
    const closing = [taxId ? `Tax ID: ${taxId}` : '', terms].filter(Boolean).join('\n');
    const closingLines = wrap(regular, closing, 8.5, CONTENT_WIDTH);
    ensure(closingLines.length * 12 + 10);
    drawLines(closingLines, MARGIN, {
      size: 8.5, leading: 12, font: regular, color: TOKENS.muted,
    });

    return Buffer.from(await document.save());
  }

  private async embedImage(
    document: PDFDocument,
    asset: InvoicePdfImageAsset | null,
  ): Promise<PDFImage | null> {
    if (!asset) return null;
    try {
      return asset.format === 'png'
        ? await document.embedPng(asset.bytes)
        : await document.embedJpg(asset.bytes);
    } catch {
      return null;
    }
  }
}
