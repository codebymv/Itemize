import {
  Controller,
  Get,
  Inject,
  Injectable,
  Logger,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { SessionOrganizationGuard } from '../common/session-organization.guard';
import { RequestContextService } from '../request-context/request-context.service';
import {
  createStripeConnectState,
  DEFAULT_RETURN_PATH,
  verifyStripeConnectState,
} from './stripe-connect-state';
import {
  STRIPE_CONNECT_CLIENT,
  StripeConnectClient,
} from './stripe-connect.provider';
import { StripeConnectService } from './stripe-connect.service';

const frontendOrigin = (): string =>
  process.env.FRONTEND_URL || 'http://localhost:5173';

const redirectWith = (
  response: Response,
  returnPath: string | null,
  query: string,
): void => {
  const path = returnPath || DEFAULT_RETURN_PATH;
  const separator = path.includes('?') ? '&' : '?';
  response.redirect(`${frontendOrigin()}${path}${separator}${query}`);
};

@Injectable()
@Controller('api/invoice-integrations/stripe')
export class StripeConnectController {
  private readonly logger = new Logger(StripeConnectController.name);

  constructor(
    @Inject(STRIPE_CONNECT_CLIENT)
    private readonly stripeConnect: StripeConnectClient,
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly requestContext: RequestContextService,
    private readonly stripeConnectService: StripeConnectService,
  ) {}

  @Get('connect')
  @UseGuards(SessionOrganizationGuard)
  connect(
    @Query('return_url') returnUrl: string | undefined,
    @Res() response: Response,
  ): void {
    try {
      const context = this.requestContext.current();
      const state = createStripeConnectState({
        userId: context.identity!.userId,
        organizationId: context.organization!.organizationId,
        returnUrl: returnUrl || DEFAULT_RETURN_PATH,
      });
      response.status(200).json({ authUrl: this.stripeConnect.getAuthUrl(state) });
    } catch (error) {
      this.logger.error(
        `Stripe Connect start failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      response.status(400).json({
        success: false,
        error: { message: 'Failed to start Stripe connection', code: 'ERROR' },
      });
    }
  }

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') providerError: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const fallbackPath = DEFAULT_RETURN_PATH;
    try {
      if (providerError) {
        redirectWith(
          response,
          fallbackPath,
          `error=${encodeURIComponent(errorDescription || providerError)}`,
        );
        return;
      }
      if (!code) {
        redirectWith(response, fallbackPath, 'error=no_code');
        return;
      }

      let stateData: ReturnType<typeof verifyStripeConnectState>;
      try {
        stateData = verifyStripeConnectState(state);
      } catch {
        redirectWith(response, fallbackPath, 'error=invalid_state');
        return;
      }
      const { userId, organizationId, returnPath } = stateData;

      const membership = await this.pool.query(
        `SELECT 1 FROM organization_members
         WHERE user_id = $1 AND organization_id = $2`,
        [userId, organizationId],
      );
      if (membership.rows.length === 0) {
        redirectWith(response, returnPath, 'error=invalid_state');
        return;
      }

      const account = await this.stripeConnect.exchangeCodeForAccount(code);
      await this.pool.query(
        `INSERT INTO payment_settings (
           organization_id, stripe_account_id, stripe_publishable_key,
           stripe_connected, stripe_connected_at
         ) VALUES ($1, $2, $3, TRUE, NOW())
         ON CONFLICT (organization_id) DO UPDATE SET
           stripe_account_id = EXCLUDED.stripe_account_id,
           stripe_publishable_key = EXCLUDED.stripe_publishable_key,
           stripe_connected = TRUE,
           stripe_connected_at = NOW(),
           updated_at = NOW()`,
        [organizationId, account.stripeAccountId, account.stripePublishableKey],
      );

      redirectWith(response, returnPath, 'stripe_connected=true');
    } catch (error) {
      this.logger.error(
        `Stripe Connect callback failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      redirectWith(response, fallbackPath, 'error=oauth_failed');
    }
  }

  @Post('disconnect')
  @UseGuards(SessionOrganizationGuard)
  async disconnect(@Res() response: Response): Promise<void> {
    try {
      const context = this.requestContext.current();
      await this.stripeConnectService.disconnect(
        context.organization!.organizationId,
      );
      response.status(200).json({ success: true });
    } catch (error) {
      this.logger.error(
        `Stripe Connect disconnect failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      response.status(500).json({
        success: false,
        error: { message: 'Failed to disconnect Stripe', code: 'ERROR' },
      });
    }
  }
}
