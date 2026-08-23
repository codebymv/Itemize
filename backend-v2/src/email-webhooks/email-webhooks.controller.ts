import {
  BadRequestException,
  Body,
  Controller,
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
  EmailWebhookInputError,
  EmailWebhooksService,
} from './email-webhooks.service';
import {
  RESEND_WEBHOOK_VERIFIER,
  ResendWebhookUnavailableError,
  ResendWebhookVerificationError,
  ResendWebhookVerifier,
} from './resend-webhook.verifier';

type RawBodyRequest = Request & { rawBody?: Buffer };

@Controller('api/email/webhook')
export class EmailWebhooksController {
  private readonly logger = new Logger(EmailWebhooksController.name);

  constructor(
    @Inject(RESEND_WEBHOOK_VERIFIER)
    private readonly verifier: ResendWebhookVerifier,
    private readonly webhooks: EmailWebhooksService,
  ) {}

  @Post('resend')
  @HttpCode(200)
  async resend(@Req() request: RawBodyRequest, @Body() _body: unknown) {
    let event: unknown;
    try {
      event = this.verifier.verify(
        request.rawBody as Buffer,
        request.headers,
      );
    } catch (error) {
      if (error instanceof ResendWebhookUnavailableError) {
        this.logger.error('[Resend webhook] Signing secret is not configured');
        throw new ServiceUnavailableException({
          error: 'Webhook verification unavailable',
        });
      }
      if (error instanceof ResendWebhookVerificationError) {
        this.logger.warn(
          `[Resend webhook] Verification failed: ${error.message}`,
        );
        throw new BadRequestException({ error: 'Invalid webhook' });
      }
      throw error;
    }

    const rawDeliveryId = request.headers['svix-id'];
    const deliveryId = Array.isArray(rawDeliveryId)
      ? rawDeliveryId[0]
      : rawDeliveryId;
    let result;
    try {
      result = await this.webhooks.processResendEvent(deliveryId, event);
    } catch (error) {
      if (error instanceof EmailWebhookInputError) {
        throw new BadRequestException({ error: 'Invalid webhook event' });
      }
      this.logger.error(
        `Resend webhook processing failed: ${(error as Error).message}`,
      );
      throw new InternalServerErrorException({
        success: false,
        error: { message: 'Internal server error', code: 'INTERNAL_ERROR' },
      });
    }
    return { received: true, ...result };
  }
}
