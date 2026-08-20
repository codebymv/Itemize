import { Module } from '@nestjs/common';
import { ActivationModule } from '../activation/activation.module';
import { InvoiceWebhooksController } from './invoice-webhooks.controller';
import { InvoiceWebhooksRepository } from './invoice-webhooks.repository';
import { InvoiceWebhooksService } from './invoice-webhooks.service';
import {
  STRIPE_INVOICE_WEBHOOK_VERIFIER,
  StripeSdkInvoiceWebhookVerifier,
} from './stripe-invoice-webhook.verifier';

@Module({
  imports: [ActivationModule],
  controllers: [InvoiceWebhooksController],
  providers: [
    InvoiceWebhooksRepository,
    InvoiceWebhooksService,
    StripeSdkInvoiceWebhookVerifier,
    {
      provide: STRIPE_INVOICE_WEBHOOK_VERIFIER,
      useExisting: StripeSdkInvoiceWebhookVerifier,
    },
  ],
})
export class InvoiceWebhooksModule {}
