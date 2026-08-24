/**
 * Organization-scoped Stripe Connect disconnection shared by the
 * retained REST route and the disconnectStripe GraphQL mutation. The
 * semantics mirror the legacy handler exactly: clear the
 * payment_settings connection columns first, then best-effort
 * deauthorize the previously stored account (a no-op for a malformed
 * or absent account id), and report success even when nothing was
 * connected — the ledger requires an idempotent already-disconnected
 * outcome.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import {
  STRIPE_CONNECT_CLIENT,
  StripeConnectClient,
} from './stripe-connect.provider';

@Injectable()
export class StripeConnectService {
  constructor(
    @Inject(STRIPE_CONNECT_CLIENT)
    private readonly stripeConnect: StripeConnectClient,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  async disconnect(organizationId: number): Promise<boolean> {
    const current = await this.pool.query<{
      stripe_account_id: string | null;
    }>(
      `SELECT stripe_account_id FROM payment_settings
       WHERE organization_id = $1`,
      [organizationId],
    );
    await this.pool.query(
      `UPDATE payment_settings
       SET stripe_account_id = NULL,
           stripe_publishable_key = NULL,
           stripe_connected = FALSE,
           stripe_connected_at = NULL,
           updated_at = NOW()
       WHERE organization_id = $1`,
      [organizationId],
    );
    await this.stripeConnect.deauthorizeAccount(
      current.rows[0]?.stripe_account_id || null,
    );
    return true;
  }
}
