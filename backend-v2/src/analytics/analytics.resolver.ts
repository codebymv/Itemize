import { Query, Resolver } from '@nestjs/graphql';
import { OrganizationScoped } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { AnalyticsService } from './analytics.service';
import { DashboardAnalytics } from './analytics.types';

@Resolver(() => DashboardAnalytics)
export class AnalyticsResolver {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly requestContext: RequestContextService,
  ) {}

  @OrganizationScoped()
  @Query(() => DashboardAnalytics)
  dashboardAnalytics(): Promise<DashboardAnalytics> {
    const organization = this.requestContext.current().organization;
    if (!organization) throw new Error('Verified organization context is unavailable');
    return this.analytics.dashboard(organization.organizationId);
  }
}
