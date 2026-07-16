import { Query, Resolver } from '@nestjs/graphql';
import { OrganizationScoped, Public } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { ViewerContext } from './foundation.types';

@Resolver()
export class FoundationResolver {
  constructor(private readonly requestContext: RequestContextService) {}

  @Public()
  @Query(() => String, { description: 'Reports whether the GraphQL process is ready.' })
  readiness(): string {
    return 'ready';
  }

  @OrganizationScoped()
  @Query(() => ViewerContext, {
    description: 'Returns the verified request identity and organization context.',
  })
  viewerContext(): ViewerContext {
    const context = this.requestContext.current();
    if (!context.identity || !context.organization) {
      throw new Error('Verified request context is unavailable');
    }
    return {
      userId: context.identity.userId,
      organizationId: context.organization.organizationId,
      organizationRole: context.organization.organizationRole,
      requestId: context.requestId,
    };
  }
}
