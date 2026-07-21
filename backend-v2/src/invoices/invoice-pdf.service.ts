import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  INVOICE_PDF_RENDERER,
  InvoicePdfRenderer,
  InvoicePdfUnavailableError,
} from './invoice-delivery.providers';
import { InvoicesRepository } from './invoices.repository';

export type InvoicePdfDocument = {
  buffer: Buffer;
  filename: string;
};

@Injectable()
export class InvoicePdfService {
  constructor(
    private readonly invoices: InvoicesRepository,
    @Inject(INVOICE_PDF_RENDERER) private readonly renderer: InvoicePdfRenderer,
  ) {}

  async render(
    organizationId: number,
    rawInvoiceId: string,
  ): Promise<InvoicePdfDocument> {
    const invoiceId = this.invoiceId(rawInvoiceId);
    const snapshot = await this.invoices.findPdfSnapshot(
      organizationId,
      invoiceId,
    );
    if (!snapshot) {
      throw new NotFoundException({
        error: 'Invoice not found',
        code: 'NOT_FOUND',
      });
    }
    let buffer: Buffer;
    try {
      buffer = await this.renderer.render(snapshot);
    } catch (error) {
      if (error instanceof InvoicePdfUnavailableError) {
        throw new ServiceUnavailableException({
          error: 'PDF generation not available',
          code: 'SERVICE_UNAVAILABLE',
        });
      }
      throw new InternalServerErrorException({
        error: 'Failed to generate PDF',
        code: 'INTERNAL_SERVER_ERROR',
      });
    }
    if (
      !Buffer.isBuffer(buffer) ||
      buffer.length < 5 ||
      buffer.subarray(0, 5).toString('ascii') !== '%PDF-'
    ) {
      throw new InternalServerErrorException({
        error: 'Failed to generate PDF',
        code: 'INTERNAL_SERVER_ERROR',
      });
    }
    return {
      buffer,
      filename: `${this.safeName(snapshot.invoice.invoice_number)}.pdf`,
    };
  }

  private invoiceId(value: string): number {
    if (!/^[1-9]\d{0,9}$/.test(value)) this.notFound();
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) this.notFound();
    return parsed;
  }

  private safeName(value: unknown): string {
    const normalized = String(value ?? '')
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .replace(/^[._-]+/, '')
      .slice(0, 120);
    return normalized || 'invoice';
  }

  private notFound(): never {
    throw new NotFoundException({
      error: 'Invoice not found',
      code: 'NOT_FOUND',
    });
  }
}
