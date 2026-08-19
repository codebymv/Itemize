import { Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { GetStartedService } from './get-started.service';
import { GetStartedProgress } from './get-started.types';

@Resolver(() => GetStartedProgress)
export class GetStartedResolver {
  constructor(
    private readonly getStarted: GetStartedService,
    private readonly requestContext: RequestContextService,
  ) {}

  @OrganizationScoped()
  @Query(() => GetStartedProgress)
  getStartedProgress(): Promise<GetStartedProgress> {
    return this.getStarted.progress(this.organizationId(), this.userId());
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => GetStartedProgress)
  dismissGetStarted(): Promise<GetStartedProgress> {
    return this.getStarted.dismiss(this.organizationId(), this.userId());
  }

  private organizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization) throw new Error('Verified organization context is unavailable');
    return organization.organizationId;
  }

  private userId(): number {
    const identity = this.requestContext.current().identity;
    if (!identity) throw new Error('Verified user identity is unavailable');
    return identity.userId;
  }
}
