import { Query, Resolver } from '@nestjs/graphql';
import { OrganizationScoped, RequiresPlan } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { IntegrationOverviewService } from './integration-overview.service';
import { IntegrationOverview } from './integration-overview.types';

@RequiresPlan()
@Resolver()
export class IntegrationOverviewResolver {
  constructor(
    private readonly overview: IntegrationOverviewService,
    private readonly requestContext: RequestContextService,
  ) {}

  @OrganizationScoped()
  @Query(() => IntegrationOverview)
  integrationOverview(): Promise<IntegrationOverview> {
    const context = this.requestContext.current();
    if (!context.organization || !context.identity) {
      throw new Error('Verified request context is unavailable');
    }
    return this.overview.get(
      context.organization.organizationId,
      context.identity.userId,
    );
  }
}
