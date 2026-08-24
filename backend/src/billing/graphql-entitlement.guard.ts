import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_PLAN_KEY, RequiredPlan } from '../common/metadata';
import { itemizeGraphqlError } from '../common/graphql-error';
import { RequestContextService } from '../request-context/request-context.service';
import { BillingEntitlementService } from './billing-entitlement.service';

@Injectable()
export class GraphqlEntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: BillingEntitlementService,
    private readonly requestContext: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType<string>() !== 'graphql') return true;

    const requiredPlan = this.reflector.getAllAndOverride<RequiredPlan>(
      REQUIRED_PLAN_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredPlan) return true;

    const organization = this.requestContext.current().organization;
    if (!organization) {
      throw itemizeGraphqlError(
        'Select an organization to continue',
        'ORGANIZATION_REQUIRED',
      );
    }

    await this.entitlements.assertPlan(
      organization.organizationId,
      requiredPlan,
    );
    return true;
  }
}
