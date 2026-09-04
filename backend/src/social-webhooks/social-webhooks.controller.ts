import { Body, Controller, Get, Logger, Post, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { HttpProviderWebhookScoped } from '../common/metadata';
import {
  MetaWebhookInputError,
  MetaWebhookNotConfiguredError,
  NormalizedMetaEvent,
  normalizeMetaMessagingEvent,
  SocialWebhooksService,
  verifyMetaChallenge,
  verifyMetaSignature,
} from './social-webhooks.service';

type RawBodyRequest = Request & { rawBody?: Buffer };

@Controller('api/social')
@HttpProviderWebhookScoped()
export class SocialWebhooksController {
  private readonly logger = new Logger(SocialWebhooksController.name);

  constructor(private readonly webhooks: SocialWebhooksService) {}

  @Get('webhook')
  verify(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() response: Response,
  ): void {
    if (!mode || !token || typeof challenge !== 'string') {
      response.sendStatus(400);
      return;
    }
    try {
      if (
        !verifyMetaChallenge({
          mode,
          token,
          configuredToken: process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN,
        })
      ) {
        response.sendStatus(403);
        return;
      }
    } catch (error) {
      if (error instanceof MetaWebhookNotConfiguredError) {
        this.logger.error('[Meta webhook] Verify token is not configured');
        response.sendStatus(503);
        return;
      }
      throw error;
    }
    response.status(200).send(challenge);
  }

  @Post('webhook')
  async receive(
    @Req() request: RawBodyRequest,
    @Res() response: Response,
    @Body() _body: unknown,
  ): Promise<void> {
    try {
      verifyMetaSignature({
        rawBody: request.rawBody,
        signature: request.get('x-hub-signature-256') ?? undefined,
      });
    } catch (error) {
      if (error instanceof MetaWebhookNotConfiguredError) {
        this.logger.error('[Meta webhook] App secret is not configured');
        response.sendStatus(503);
        return;
      }
      this.logger.warn(
        `[Meta webhook] Signature verification failed: ${(error as Error).message}`,
      );
      response.sendStatus(401);
      return;
    }

    let body: {
      object?: string;
      entry?: Array<{ id?: string; messaging?: Array<{ message?: unknown }> }>;
    };
    try {
      body = JSON.parse((request.rawBody as Buffer).toString('utf8'));
    } catch {
      response.sendStatus(400);
      return;
    }
    if (!['page', 'instagram'].includes(body.object as string)) {
      response.sendStatus(404);
      return;
    }

    const channelType = body.object === 'instagram' ? 'instagram' : 'facebook';
    const normalizedEvents: NormalizedMetaEvent[] = [];
    try {
      for (const entry of body.entry || []) {
        for (const messagingEvent of entry.messaging || []) {
          if (!messagingEvent?.message) continue;
          normalizedEvents.push(
            normalizeMetaMessagingEvent(
              entry.id,
              messagingEvent as Parameters<typeof normalizeMetaMessagingEvent>[1],
              channelType,
            ),
          );
        }
      }
    } catch (error) {
      if (error instanceof MetaWebhookInputError) {
        response.sendStatus(400);
        return;
      }
      this.logger.error(
        `[Meta webhook] Normalization failed: ${(error as Error).message}`,
      );
      response.sendStatus(500);
      return;
    }

    try {
      // Claim durably and stop: the legacy scheduler's leased worker owns
      // processing and the agent-room emission until the scheduler moves.
      await this.webhooks.claimMetaMessagingEvents(normalizedEvents);
    } catch (error) {
      this.logger.error(
        `[Meta webhook] Durable batch claim failed: ${(error as { code?: string }).code || 'unknown'}`,
      );
      response.sendStatus(500);
      return;
    }

    response.status(200).send('EVENT_RECEIVED');
  }
}
