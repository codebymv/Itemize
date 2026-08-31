import { Injectable } from '@nestjs/common';
import { PageInput } from '../common/pagination';
import { InvoiceBusinessesService } from '../invoice-businesses/invoice-businesses.service';
import { RecurringInvoicesService } from '../recurring-invoices/recurring-invoices.service';
import { RecurringInvoicePreviewBootstrap } from './recurring-invoice-preview.types';

const firstPage = (): PageInput =>
  Object.assign(new PageInput(), { page: 1, pageSize: 1 });

@Injectable()
export class RecurringInvoicePreviewService {
  constructor(
    private readonly recurringInvoices: RecurringInvoicesService,
    private readonly businesses: InvoiceBusinessesService,
  ) {}

  async bootstrap(
    organizationId: number,
    recurringInvoiceId: number,
  ): Promise<RecurringInvoicePreviewBootstrap> {
    const [recurringInvoice, previewInvoiceNumber, businesses] =
      await Promise.all([
        this.recurringInvoices.get(organizationId, recurringInvoiceId),
        this.recurringInvoices.previewInvoiceNumber(organizationId),
        this.businesses.list(organizationId, firstPage()),
      ]);

    return {
      recurringInvoice,
      previewInvoiceNumber,
      business: businesses.nodes[0] ?? null,
    };
  }
}
