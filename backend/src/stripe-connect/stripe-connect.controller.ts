import { Controller, Get, Injectable, Logger, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { DEFAULT_RETURN_PATH } from './stripe-connect-state';
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

  constructor(private readonly stripeConnect: StripeConnectService) {}

  @Get('refresh')
  async refresh(
    @Query('state') state: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    try {
      response.redirect(await this.stripeConnect.refresh(state));
    } catch (error) {
      this.logger.error(
        `Stripe Connect refresh failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      redirectWith(response, DEFAULT_RETURN_PATH, 'error=onboarding_expired');
    }
  }

  @Get('return')
  async complete(
    @Query('state') state: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const result = await this.stripeConnect.complete(state);
      redirectWith(
        response,
        result.returnPath,
        result.connected
          ? 'stripe_connected=true'
          : 'stripe_onboarding=pending',
      );
    } catch (error) {
      this.logger.error(
        `Stripe Connect completion failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      redirectWith(response, DEFAULT_RETURN_PATH, 'error=onboarding_failed');
    }
  }
}
