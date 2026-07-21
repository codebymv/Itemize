import { Module } from '@nestjs/common';
import { InvoicesRepository } from './invoices.repository';
import { InvoiceEmailPreviewService } from './invoice-email-preview.service';
import { InvoicesResolver } from './invoices.resolver';
import { InvoicesService } from './invoices.service';
import { InvoiceEmailDeliveryService } from './invoice-email-delivery.service';
import { InvoicePaymentLinkService } from './invoice-payment-link.service';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { InvoicePdfController } from './invoice-pdf.controller';
import { InvoicePdfGuard } from './invoice-pdf.guard';
import { InvoicePdfService } from './invoice-pdf.service';
import {
  INVOICE_EMAIL_PROVIDER,
  INVOICE_PAYMENT_LINK_PROVIDER,
  INVOICE_PDF_RENDERER,
  LegacyInvoicePdfRenderer,
  ResendInvoiceEmailProvider,
  StripeInvoicePaymentLinkProvider,
} from './invoice-delivery.providers';

@Module({
  imports: [AuthModule, OrganizationsModule],
  controllers: [InvoicePdfController],
  providers: [
    InvoicesRepository,
    InvoicesService,
    InvoiceEmailPreviewService,
    InvoiceEmailDeliveryService,
    InvoicePaymentLinkService,
    InvoicePdfGuard,
    InvoicePdfService,
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
