import {
  BadRequestException,
  Body,
  Controller,
  Header,
  HttpCode,
  Inject,
  InternalServerErrorException,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Request } from 'express';
import {
  InvoiceWebhooksService,
  StripeInvoiceWebhookInputError,
} from './invoice-webhooks.service';
import {
  STRIPE_INVOICE_WEBHOOK_VERIFIER,
  StripeInvoiceWebhookUnavailableError,
  StripeInvoiceWebhookVerificationError,
  StripeInvoiceWebhookVerifier,
} from './stripe-invoice-webhook.verifier';

type RawBodyRequest = Request & { rawBody?: Buffer };

@Controller('api/invoices/webhook')
export class InvoiceWebhooksController {
  private readonly logger = new Logger(InvoiceWebhooksController.name);

  constructor(
    @Inject(STRIPE_INVOICE_WEBHOOK_VERIFIER)
    private readonly verifier: StripeInvoiceWebhookVerifier,
    private readonly webhooks: InvoiceWebhooksService,
  ) {}

  @Post('stripe')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async stripe(
    @Req() request: RawBodyRequest,
    @Body() _body: unknown,
  ): Promise<{ success: true; data: Awaited<ReturnType<InvoiceWebhooksService['process']>> }> {
    if (!Buffer.isBuffer(request.rawBody)) {
      throw new BadRequestException({
        error: 'Raw webhook body is required',
        code: 'BAD_REQUEST',
      });
    }
    const rawSignature = request.headers['stripe-signature'];
    const signature = Array.isArray(rawSignature) ? rawSignature[0] : rawSignature;
    let event;
    try {
      event = this.verifier.verify(request.rawBody, signature);
    } catch (error) {
      if (error instanceof StripeInvoiceWebhookUnavailableError) {
        throw new ServiceUnavailableException({
          error: 'Webhook verification unavailable',
          code: 'SERVICE_UNAVAILABLE',
        });
      }
      if (error instanceof StripeInvoiceWebhookVerificationError) {
        throw new BadRequestException({
          error: 'Webhook signature verification failed',
          code: 'BAD_REQUEST',
        });
      }
      throw error;
    }
    try {
      return { success: true, data: await this.webhooks.process(event) };
    } catch (error) {
      if (error instanceof StripeInvoiceWebhookInputError) {
        throw new BadRequestException({
          error: 'Webhook event is invalid',
          code: 'BAD_REQUEST',
        });
      }
      this.logger.error('Stripe invoice webhook processing failed', {
        eventId: event.id,
        eventType: event.type,
      });
      throw new InternalServerErrorException({
        error: 'Webhook processing failed',
        code: 'INTERNAL_SERVER_ERROR',
      });
    }
  }
}
