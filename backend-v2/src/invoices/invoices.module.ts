import { Module } from '@nestjs/common';
import { InvoicesRepository } from './invoices.repository';
import { InvoiceEmailPreviewService } from './invoice-email-preview.service';
import { InvoicesResolver } from './invoices.resolver';
import { InvoicesService } from './invoices.service';
import { InvoiceEmailDeliveryService } from './invoice-email-delivery.service';
import { InvoicePaymentLinkService } from './invoice-payment-link.service';
import {
  INVOICE_EMAIL_PROVIDER,
  INVOICE_PAYMENT_LINK_PROVIDER,
  INVOICE_PDF_RENDERER,
  LegacyInvoicePdfRenderer,
  ResendInvoiceEmailProvider,
  StripeInvoicePaymentLinkProvider,
} from './invoice-delivery.providers';

@Module({
  providers: [
    InvoicesRepository,
    InvoicesService,
    InvoiceEmailPreviewService,
    InvoiceEmailDeliveryService,
    InvoicePaymentLinkService,
    ResendInvoiceEmailProvider,
    StripeInvoicePaymentLinkProvider,
    LegacyInvoicePdfRenderer,
    { provide: INVOICE_EMAIL_PROVIDER, useExisting: ResendInvoiceEmailProvider },
    { provide: INVOICE_PAYMENT_LINK_PROVIDER, useExisting: StripeInvoicePaymentLinkProvider },
    { provide: INVOICE_PDF_RENDERER, useExisting: LegacyInvoicePdfRenderer },
    InvoicesResolver,
  ],
  exports: [InvoicesService, InvoiceEmailDeliveryService, InvoicePaymentLinkService],
})
export class InvoicesModule {}
