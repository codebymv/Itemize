import {
  Controller,
  Get,
  Inject,
  Logger,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { Response } from 'express';
import { SessionOrganizationGuard } from '../common/session-organization.guard';
import { RequestContextService } from '../request-context/request-context.service';
import {
  FACEBOOK_GRAPH_CLIENT,
  FacebookGraphClient,
} from './facebook-graph.provider';
import { SocialOAuthRepository } from './social-oauth.repository';

const frontendUrl = (): string => process.env.FRONTEND_URL as string;

const redirectUri = (): string =>
  process.env.FACEBOOK_REDIRECT_URI ||
  `${process.env.BACKEND_URL}/api/social/callback/facebook`;

@Controller('api/social')
export class SocialOAuthController {
  private readonly logger = new Logger(SocialOAuthController.name);

  constructor(
    @Inject(FACEBOOK_GRAPH_CLIENT)
    private readonly graph: FacebookGraphClient,
    private readonly repository: SocialOAuthRepository,
    private readonly requestContext: RequestContextService,
  ) {}

  @Get('connect/facebook')
  @UseGuards(SessionOrganizationGuard)
  async connect(@Res() response: Response): Promise<void> {
    try {
      const appId = process.env.FACEBOOK_APP_ID;
      if (!appId) {
        response.status(400).json({ error: 'Facebook app not configured' });
        return;
      }

      const state = crypto.randomBytes(32).toString('hex');
      const context = this.requestContext.current();
      await this.repository.storeState({
        state,
        organizationId: context.organization!.organizationId,
        userId: context.identity!.userId,
      });

      const scopes = [
        'pages_show_list',
        'pages_messaging',
        'pages_manage_metadata',
        'pages_read_engagement',
        'instagram_basic',
        'instagram_manage_messages',
        'business_management',
      ].join(',');
      const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri())}&scope=${scopes}&state=${state}`;
      response.status(200).json({ auth_url: authUrl });
    } catch (error) {
      this.logger.error(
        `Error generating Facebook OAuth URL: ${(error as Error).message}`,
      );
      response.status(500).json({
        success: false,
        error: { message: 'Failed to generate OAuth URL', code: 'ERROR' },
      });
    }
  }

  @Get('callback/facebook')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') providerError: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    try {
      if (providerError) {
        this.logger.error(
          `Facebook OAuth error: ${providerError} ${errorDescription ?? ''}`,
        );
        response.redirect(
          `${frontendUrl()}/calendar-integrations?error=${encodeURIComponent(errorDescription || providerError)}`,
        );
        return;
      }
      if (!code || !state) {
        response.redirect(
          `${frontendUrl()}/calendar-integrations?error=missing_params`,
        );
        return;
      }

      const stateData = await this.repository.claimState(state);
      if (!stateData) {
        response.redirect(
          `${frontendUrl()}/calendar-integrations?error=invalid_state`,
        );
        return;
      }

      const tokenData = await this.graph.exchangeCode({
        appId: process.env.FACEBOOK_APP_ID as string,
        appSecret: process.env.FACEBOOK_APP_SECRET as string,
        redirectUri: redirectUri(),
        code,
      });
      if (tokenData.error) {
        this.logger.error('Facebook token error');
        response.redirect(
          `${frontendUrl()}/calendar-integrations?error=token_exchange_failed`,
        );
        return;
      }
      const userAccessToken = tokenData.access_token as string;

      const pagesData = await this.graph.getPages(userAccessToken);
      if (pagesData.error) {
        this.logger.error('Facebook pages error');
        response.redirect(
          `${frontendUrl()}/calendar-integrations?error=pages_fetch_failed`,
        );
        return;
      }

      const meData = await this.graph.getMe(userAccessToken);
      await this.repository.saveChannels({
        organizationId: stateData.organizationId,
        userId: stateData.userId,
        pages: pagesData.data || [],
        providerUserId: meData.id ?? null,
        userAccessToken,
      });

      response.redirect(
        `${frontendUrl()}/calendar-integrations?success=facebook_connected`,
      );
    } catch (error) {
      this.logger.error(
        `Error in Facebook callback: ${(error as Error).message}`,
      );
      response.redirect(
        `${frontendUrl()}/calendar-integrations?error=callback_failed`,
      );
    }
  }
}
