import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { RequestContextService } from '../request-context/request-context.service';
import { InvoicePdfGuard } from './invoice-pdf.guard';
import { InvoicePdfService } from './invoice-pdf.service';

@Controller('api/invoices')
@UseGuards(InvoicePdfGuard)
export class InvoicePdfController {
  constructor(
    private readonly pdf: InvoicePdfService,
    private readonly requestContext: RequestContextService,
  ) {}

  @Get(':id/pdf')
  async download(
    @Param('id') id: string,
    @Res() response: Response,
  ): Promise<void> {
    const organization = this.requestContext.current().organization;
    if (!organization) {
      throw new Error('Verified invoice PDF context is unavailable');
    }
    const document = await this.pdf.render(organization.organizationId, id);
    response.set({
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="${document.filename}"`,
      'Content-Length': String(document.buffer.length),
      'Content-Security-Policy': 'sandbox',
      'Content-Type': 'application/pdf',
      'X-Content-Type-Options': 'nosniff',
    });
    response.send(document.buffer);
  }
}
