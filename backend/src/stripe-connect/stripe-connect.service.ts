import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import {
  createStripeConnectState,
  verifyStripeConnectState,
} from './stripe-connect-state';
import {
  STRIPE_ACCOUNT_ID,
  STRIPE_CONNECT_CLIENT,
  StripeConnectClient,
  StripeConnectedAccount,
} from './stripe-connect.provider';

const ONBOARDING_STATE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CONNECT_LOCK_NAMESPACE = 41_772;

type VerifiedConnectState = {
  userId: number;
  organizationId: number;
  returnPath: string;
};

export type StripeOnboardingResult = {
  connected: boolean;
  returnPath: string;
};

@Injectable()
export class StripeConnectService {
  constructor(
    @Inject(STRIPE_CONNECT_CLIENT)
    private readonly stripeConnect: StripeConnectClient,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  async start(
    userId: number,
    organizationId: number,
    returnUrl?: unknown,
  ): Promise<string> {
    const state = createStripeConnectState({
      userId,
      organizationId,
      returnUrl,
    });
    const account = await this.findOrCreateAccount(organizationId);
    return this.stripeConnect.createOnboardingLink(
      account.stripeAccountId,
      state,
    );
  }

  async refresh(state: unknown): Promise<string> {
    const verified = await this.verifiedState(state);
    const account = await this.findOrCreateAccount(verified.organizationId);
    return this.stripeConnect.createOnboardingLink(
      account.stripeAccountId,
      String(state),
    );
  }

  async complete(state: unknown): Promise<StripeOnboardingResult> {
    const verified = await this.verifiedState(state);
    const current = await this.pool.query<{ stripe_account_id: string | null }>(
      `SELECT stripe_account_id
       FROM payment_settings
       WHERE organization_id = $1`,
      [verified.organizationId],
    );
    const accountId = current.rows[0]?.stripe_account_id?.trim() || '';
    if (!STRIPE_ACCOUNT_ID.test(accountId)) {
      throw new Error('Stripe connected account was not found');
    }
    const account = await this.stripeConnect.retrieveAccount(accountId);
    if (!account) throw new Error('Stripe connected account was not found');
    const connected = account.chargesEnabled && account.detailsSubmitted;
    await this.pool.query(
      `UPDATE payment_settings
       SET stripe_connected = $2,
           stripe_connected_at = CASE WHEN $2 THEN COALESCE(stripe_connected_at, NOW()) ELSE NULL END,
           updated_at = NOW()
       WHERE organization_id = $1`,
      [verified.organizationId, connected],
    );
    return { connected, returnPath: verified.returnPath };
  }

  async disconnect(organizationId: number): Promise<boolean> {
    await this.pool.query(
      `UPDATE payment_settings
       SET stripe_publishable_key = NULL,
           stripe_connected = FALSE,
           stripe_connected_at = NULL,
           updated_at = NOW()
       WHERE organization_id = $1`,
      [organizationId],
    );
    return true;
  }

  private async findOrCreateAccount(
    organizationId: number,
  ): Promise<StripeConnectedAccount> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1, $2)', [
        CONNECT_LOCK_NAMESPACE,
        organizationId,
      ]);
      const current = await client.query<{ stripe_account_id: string | null }>(
        `SELECT stripe_account_id
         FROM payment_settings
         WHERE organization_id = $1`,
        [organizationId],
      );
      const existingId = current.rows[0]?.stripe_account_id?.trim() || '';
      const existing = STRIPE_ACCOUNT_ID.test(existingId)
        ? await this.stripeConnect.retrieveAccount(existingId)
        : null;
      const account =
        existing || (await this.stripeConnect.createAccount(organizationId));
      await this.storeAccount(client, organizationId, account.stripeAccountId);
      await client.query('COMMIT');
      return account;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async storeAccount(
    client: PoolClient,
    organizationId: number,
    stripeAccountId: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO payment_settings (
         organization_id, stripe_account_id, stripe_connected,
         invoice_prefix, next_invoice_number, default_payment_terms,
         default_tax_rate, default_currency
       ) VALUES ($1, $2, FALSE, 'INV-', 1, 30, 10, 'USD')
       ON CONFLICT (organization_id) DO UPDATE SET
         stripe_account_id = EXCLUDED.stripe_account_id,
         stripe_publishable_key = NULL,
         stripe_connected = CASE
           WHEN payment_settings.stripe_account_id = EXCLUDED.stripe_account_id
             THEN payment_settings.stripe_connected
           ELSE FALSE
         END,
         stripe_connected_at = CASE
           WHEN payment_settings.stripe_account_id = EXCLUDED.stripe_account_id
             THEN payment_settings.stripe_connected_at
           ELSE NULL
         END,
         updated_at = NOW()`,
      [organizationId, stripeAccountId],
    );
  }

  private async verifiedState(state: unknown): Promise<VerifiedConnectState> {
    const verified = verifyStripeConnectState(state, {
      maxAgeMs: ONBOARDING_STATE_MAX_AGE_MS,
    });
    const membership = await this.pool.query(
      `SELECT 1 FROM organization_members
       WHERE user_id = $1 AND organization_id = $2`,
      [verified.userId, verified.organizationId],
    );
    if (membership.rows.length === 0) throw new Error('Invalid Stripe state');
    return verified;
  }
}
