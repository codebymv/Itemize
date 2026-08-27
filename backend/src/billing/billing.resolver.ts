import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped, Public } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { itemizeGraphqlError } from '../common/graphql-error';
import {
  CreateBillingCheckoutInput,
  CreateBillingPortalInput,
} from './billing.inputs';
import { BillingService } from './billing.service';
import {
  BillingPlan,
  BillingSession,
  BillingStatus,
  BillingUsage,
  TrialAcknowledgement,
} from './billing.types';

@Resolver()
export class BillingResolver {
  constructor(
    private readonly billing: BillingService,
    private readonly requestContext: RequestContextService,
  ) {}

  @OrganizationScoped()
  @Query(() => BillingStatus)
  billingStatus(): Promise<BillingStatus> {
    return this.billing.status(this.organizationId());
  }

  @Public()
  @Query(() => [BillingPlan])
  billingPlans(): BillingPlan[] {
    return this.billing.plans();
  }

  @OrganizationScoped()
  @Query(() => BillingUsage)
  billingUsage(): Promise<BillingUsage> {
    return this.billing.usage(this.organizationId());
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => BillingSession)
  createBillingCheckoutSession(
    @Args('input') input: CreateBillingCheckoutInput,
  ): Promise<BillingSession> {
    return this.billing.checkout(this.billingOwnerOrganizationId(), input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => BillingSession)
  createBillingPortalSession(
    @Args('input') input: CreateBillingPortalInput,
  ): Promise<BillingSession> {
    return this.billing.portal(
      this.billingOwnerOrganizationId(),
      input.returnUrl,
      input.idempotencyKey,
    );
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => TrialAcknowledgement)
  acknowledgeBillingTrialEnd(): Promise<TrialAcknowledgement> {
    return this.billing.acknowledgeTrialEnd(this.organizationId());
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => BillingStatus)
  startBillingSoloTrial(): Promise<BillingStatus> {
    return this.billing.startSoloTrial(this.billingOwnerOrganizationId());
  }

  private organizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization) {
      throw new Error('Verified organization context is unavailable');
    }
    return organization.organizationId;
  }

  private billingOwnerOrganizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization) {
      throw new Error('Verified organization context is unavailable');
    }
    if (organization.organizationRole.toLowerCase() !== 'owner') {
      throw itemizeGraphqlError(
        'Only the organization owner can manage billing',
        'FORBIDDEN',
        { reason: 'BILLING_OWNER_REQUIRED' },
      );
    }
    return organization.organizationId;
  }
}
