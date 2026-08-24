import { Body, Controller, Inject, Logger, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { SMS_STATUS_MAP, SmsWebhooksService } from './sms-webhooks.service';
import {
  TWILIO_WEBHOOK_VERIFIER,
  TwilioWebhookVerifier,
} from './twilio-webhook.verifier';

const TWIML_EMPTY_RESPONSE =
  '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

@Controller('api/sms-templates/webhook')
export class SmsWebhooksController {
  private readonly logger = new Logger(SmsWebhooksController.name);

  constructor(
    @Inject(TWILIO_WEBHOOK_VERIFIER)
    private readonly verifier: TwilioWebhookVerifier,
    private readonly webhooks: SmsWebhooksService,
  ) {}

  @Post('status')
  async status(
    @Req() request: Request,
    @Res() response: Response,
    @Body() body: Record<string, string | undefined>,
  ): Promise<void> {
    try {
      const verification = this.verifier.verify(request);
      if (verification.kind === 'rejected') {
        response.status(verification.status).send(verification.body);
        return;
      }

      const messageSid = body?.MessageSid;
      if (!messageSid) {
        response.status(400).send('MessageSid required');
        return;
      }
      const providerStatus = String(body?.MessageStatus ?? '');
      const dbStatus = SMS_STATUS_MAP[providerStatus];
      if (!dbStatus) {
        response.status(400).send('Unsupported MessageStatus');
        return;
      }

      const outcome = await this.webhooks.processStatusEvent({
        messageSid,
        dbStatus,
        errorCode: body?.ErrorCode || null,
        errorMessage: body?.ErrorMessage || null,
        providerStatus,
      });
      response.status(200).send(outcome.duplicate ? 'Duplicate' : 'OK');
    } catch (error) {
      this.logger.error(
        `Error processing SMS status webhook: ${(error as Error).message}`,
      );
      response.status(500).send('Error');
    }
  }

  @Post('inbound')
  async inbound(
    @Req() request: Request,
    @Res() response: Response,
    @Body() body: Record<string, string | undefined>,
  ): Promise<void> {
    try {
      const verification = this.verifier.verify(request);
      if (verification.kind === 'rejected') {
        response.status(verification.status).send(verification.body);
        return;
      }

      const messageSid = body?.MessageSid;
      const fromPhone = body?.From;
      const toPhone = body?.To;
      const messageBody = body?.Body;
      if (!messageSid || !fromPhone || !toPhone || !messageBody) {
        response.status(400).send('Missing required fields');
        return;
      }

      const outcome = await this.webhooks.processInboundEvent({
        messageSid,
        fromPhone,
        toPhone,
        messageBody,
      });
      if (!outcome.routed && !outcome.duplicate) {
        this.logger.warn(
          `[Twilio webhook] Inbound SMS was not tenant-routable: ${outcome.reason}`,
        );
      }

      response.status(200).type('text/xml');
      response.send(TWIML_EMPTY_RESPONSE);
    } catch (error) {
      this.logger.error(
        `Error processing inbound SMS webhook: ${(error as Error).message}`,
      );
      response.status(500).send('Error');
    }
  }
}
