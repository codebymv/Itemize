import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { RequiredPlan } from '../common/metadata';
import { itemizeGraphqlError } from '../common/graphql-error';
import { PG_POOL } from '../database/database.module';
import { RequestContextService } from '../request-context/request-context.service';
import { hasPlanEntitlement, PaidEntitlementState } from './billing-entitlement';

@Injectable()
export class BillingEntitlementService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly requestContext: RequestContextService,
  ) {}

  async assertPlan(organizationId: number, requiredPlan: RequiredPlan): Promise<void> {
    const state = await this.state(organizationId);
    if (hasPlanEntitlement(state, requiredPlan)) return;

    throw itemizeGraphqlError(
      `This feature requires the ${this.displayName(requiredPlan)} plan or higher`,
      'FORBIDDEN',
      {
        reason: 'SUBSCRIPTION_REQUIRED',
        plan: state.plan ?? 'free',
        requiredPlan,
      },
    );
  }

  private async state(organizationId: number): Promise<PaidEntitlementState> {
    const context = this.requestContext.current();
    if (context.entitlement?.organizationId === organizationId) {
      return {
        plan: context.entitlement.plan,
        subscription_status: context.entitlement.subscriptionStatus,
        trial_ends_at: context.entitlement.trialEndsAt,
      };
    }

    const result = await this.pool.query<PaidEntitlementState>(
      `SELECT plan, subscription_status, trial_ends_at
       FROM organizations
       WHERE id = $1`,
      [organizationId],
    );
    const state = result.rows[0];
    if (!state) {
      throw itemizeGraphqlError('Organization not found', 'NOT_FOUND');
    }

    context.entitlement = {
      organizationId,
      plan: state.plan,
      subscriptionStatus: state.subscription_status,
      trialEndsAt: state.trial_ends_at,
    };
    return state;
  }

  private displayName(plan: RequiredPlan): string {
    if (plan === 'starter') return 'Solo';
    if (plan === 'unlimited') return 'Studio';
    return 'Studio+';
  }
}
