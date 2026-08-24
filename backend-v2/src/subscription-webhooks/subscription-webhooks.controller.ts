import {
  Body,
  Controller,
  Inject,
  Logger,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  STRIPE_SUBSCRIPTION_WEBHOOK_VERIFIER,
  StripeSubscriptionWebhookUnavailableError,
  StripeSubscriptionWebhookVerificationError,
  StripeSubscriptionWebhookVerifier,
} from './stripe-subscription-webhook.verifier';
import {
  SubscriptionWebhookInputError,
  SubscriptionWebhooksService,
} from './subscription-webhooks.service';

type RawBodyRequest = Request & { rawBody?: Buffer };

@Controller('api/billing')
export class SubscriptionWebhooksController {
  private readonly logger = new Logger(SubscriptionWebhooksController.name);

  constructor(
    @Inject(STRIPE_SUBSCRIPTION_WEBHOOK_VERIFIER)
    private readonly verifier: StripeSubscriptionWebhookVerifier,
    private readonly webhooks: SubscriptionWebhooksService,
  ) {}

  @Post('webhook')
  async stripe(
    @Req() request: RawBodyRequest,
    @Res() response: Response,
    @Body() _body: unknown,
  ): Promise<void> {
    const rawSignature = request.headers['stripe-signature'];
    const signature = Array.isArray(rawSignature)
      ? rawSignature[0]
      : rawSignature;
    if (!signature) {
      response.status(400).send('Webhook Error: Missing signature');
      return;
    }

    let event: unknown;
    try {
      event = this.verifier.verify(request.rawBody as Buffer, signature);
    } catch (error) {
      if (error instanceof StripeSubscriptionWebhookUnavailableError) {
        this.logger.error('[Billing] Stripe webhook secret is not configured');
        response
          .status(503)
          .json({ error: 'Webhook verification unavailable' });
        return;
      }
      if (error instanceof StripeSubscriptionWebhookVerificationError) {
        this.logger.warn(
          `[Billing] Stripe webhook verification failed: ${error.message}`,
        );
        response.status(400).json({ error: 'Invalid webhook' });
        return;
      }
      throw error;
    }

    let result;
    try {
      result = await this.webhooks.processStripeSubscriptionEvent(event);
    } catch (error) {
      if (error instanceof SubscriptionWebhookInputError) {
        response.status(400).json({ error: 'Invalid webhook event' });
        return;
      }
      this.logger.error(
        `[Billing] Stripe webhook processing failed: ${(error as Error).message}`,
      );
      response.status(500).json({ error: 'Webhook processing failed' });
      return;
    }

    response.status(200).json({ received: true, ...result });
  }
}
