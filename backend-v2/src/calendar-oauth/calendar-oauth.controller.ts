import {
  Controller,
  Get,
  Inject,
  Logger,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { RequestContextService } from '../request-context/request-context.service';
import {
  createCalendarOAuthState,
  verifyCalendarOAuthState,
} from './calendar-oauth-state';
import { CalendarOAuthGuard } from './calendar-oauth.guard';
import { CalendarOAuthRepository } from './calendar-oauth.repository';
import {
  GOOGLE_CALENDAR_OAUTH_PROVIDER,
  GoogleCalendarOAuthProvider,
} from './google-calendar-oauth.provider';

const frontendUrl = (): string =>
  process.env.FRONTEND_URL || 'http://localhost:5173';

@Controller('api/calendar-integrations/google')
export class CalendarOAuthController {
  private readonly logger = new Logger(CalendarOAuthController.name);

  constructor(
    @Inject(GOOGLE_CALENDAR_OAUTH_PROVIDER)
    private readonly provider: GoogleCalendarOAuthProvider,
    private readonly repository: CalendarOAuthRepository,
    private readonly requestContext: RequestContextService,
  ) {}

  @Get('auth')
  @UseGuards(CalendarOAuthGuard)
  begin(
    @Query('return_url') returnUrl: string | undefined,
    @Res() response: Response,
  ): void {
    try {
      const context = this.requestContext.current();
      const state = createCalendarOAuthState({
        userId: context.identity!.userId,
        organizationId: context.organization!.organizationId,
        returnUrl: returnUrl || '/calendars',
      });
      response.status(200).json({ authUrl: this.provider.getAuthUrl(state) });
    } catch (error) {
      this.logIntegrationError('beginGoogleOAuth', error);
      response.status(500).json({
        success: false,
        error: {
          message: 'Failed to initiate Google authentication',
          code: 'ERROR',
        },
      });
    }
  }

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    try {
      if (!code) {
        response.redirect(`${frontendUrl()}/calendars?error=no_code`);
        return;
      }

      let stateData: ReturnType<typeof verifyCalendarOAuthState>;
      try {
        stateData = verifyCalendarOAuthState(state);
      } catch {
        response.redirect(`${frontendUrl()}/calendars?error=invalid_state`);
        return;
      }
      const { userId, organizationId, returnPath } = stateData;

      if (!(await this.repository.isOrganizationMember(userId, organizationId))) {
        response.redirect(`${frontendUrl()}/calendars?error=invalid_state`);
        return;
      }

      const tokens = await this.provider.exchangeCodeForTokens(code);
      const userInfo = await this.provider.getUserInfo(
        tokens.access_token as string,
      );
      const tokenExpiresAt = tokens.expiry_date
        ? new Date(tokens.expiry_date)
        : new Date(Date.now() + 3600 * 1000);

      await this.repository.saveGoogleConnection({
        userId,
        organizationId,
        providerAccountId: userInfo.id as string,
        providerEmail: userInfo.email ?? null,
        accessToken: tokens.access_token as string,
        refreshToken: tokens.refresh_token ?? null,
        tokenExpiresAt,
      });

      const separator = returnPath.includes('?') ? '&' : '?';
      response.redirect(
        `${frontendUrl()}${returnPath}${separator}google_connected=true`,
      );
    } catch (error) {
      this.logIntegrationError('googleOAuthCallback', error);
      response.redirect(`${frontendUrl()}/calendars?error=oauth_failed`);
    }
  }

  @Get('calendars/:connectionId')
  @UseGuards(CalendarOAuthGuard)
  async providerCalendars(
    @Param('connectionId') connectionId: string,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const context = this.requestContext.current();
      const connection = await this.repository.loadGoogleConnection(
        {
          connectionId,
          userId: context.identity!.userId,
          organizationId: context.organization!.organizationId,
        },
        this.provider,
      );
      if (!connection) {
        response.status(404).json({ error: 'Connection not found' });
        return;
      }
      const calendars = await this.provider.listCalendars(
        connection.access_token,
        connection.refresh_token,
      );
      response.status(200).json(calendars);
    } catch (error) {
      this.logIntegrationError('listGoogleCalendars', error);
      response.status(500).json({
        success: false,
        error: { message: 'Failed to fetch calendars', code: 'ERROR' },
      });
    }
  }

  private logIntegrationError(operation: string, error: unknown): void {
    this.logger.error(
      `Calendar integration request failed: ${operation}: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    );
  }
}
