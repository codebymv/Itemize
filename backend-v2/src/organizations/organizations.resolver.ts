import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { Organization } from './organization.types';
import { OrganizationsService } from './organizations.service';

@Resolver(() => Organization)
export class OrganizationsResolver {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly requestContext: RequestContextService,
  ) {}

  @Query(() => [Organization], { name: 'organizations' })
  organizationsList(): Promise<Organization[]> {
    return this.organizations.list(this.userId());
  }

  @CsrfProtected()
  @Mutation(() => Organization)
  selectOrganization(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<Organization> {
    return this.organizations.select(this.userId(), id);
  }

  @CsrfProtected()
  @Mutation(() => Organization)
  ensureDefaultOrganization(): Promise<Organization> {
    return this.organizations.ensureDefault(this.userId());
  }

  private userId(): number {
    const identity = this.requestContext.current().identity;
    if (!identity) throw new Error('Verified user identity is unavailable');
    return identity.userId;
  }
}
