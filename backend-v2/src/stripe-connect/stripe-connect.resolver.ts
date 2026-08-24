/**
 * GraphQL owner of the Stripe Connect disconnection, following the
 * calendar provider connection-management mutation precedent: an
 * authenticated, CSRF-protected, organization-scoped state change with
 * an idempotent already-disconnected outcome. Deliberately no plan
 * gate — like the legacy REST route, an organization whose
 * subscription lapsed must still be able to disconnect its account.
 */
import { Mutation, Resolver } from '@nestjs/graphql';
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
  @Mutation(() => Boolean)
  disconnectStripe(): Promise<boolean> {
    const context = this.requestContext.current();
    return this.stripeConnect.disconnect(
      context.organization!.organizationId,
    );
  }
}
