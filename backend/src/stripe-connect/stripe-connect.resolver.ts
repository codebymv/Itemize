/**
 * Authenticated, CSRF-protected, organization-scoped entry points for
 * Stripe onboarding and local payment disablement. There is deliberately
 * no plan gate so an organization can always disable its connection.
 */
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { StripeConnectService } from './stripe-connect.service';

@Resolver()
export class StripeConnectResolver {
  constructor(
    private readonly stripeConnect: StripeConnectService,
    private readonly requestContext: RequestContextService,
  ) {}

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => String)
  startStripeConnect(
    @Args('returnUrl', { type: () => String, nullable: true })
    returnUrl?: string,
  ): Promise<string> {
    const context = this.requestContext.current();
    return this.stripeConnect.start(
      context.identity!.userId,
      context.organization!.organizationId,
      returnUrl,
    );
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Boolean)
  disconnectStripe(): Promise<boolean> {
    const context = this.requestContext.current();
    return this.stripeConnect.disconnect(
      context.organization!.organizationId,
    );
  }
}
