import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { OrganizationScoped } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { AnalyticsService } from './analytics.service';
import {
  CommunicationAnalyticsPeriod,
  ContactAnalyticsPeriod,
  DealAnalyticsPeriod,
} from './analytics.enums';
import {
  BookingAnalytics,
  CommunicationStatsAnalytics,
  ContactTrendsAnalytics,
  DashboardAnalytics,
  DealPerformanceAnalytics,
  ReputationAnalytics,
  WorkflowPerformanceAnalytics,
} from './analytics.types';

@Resolver(() => DashboardAnalytics)
export class AnalyticsResolver {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly requestContext: RequestContextService,
  ) {}

  @OrganizationScoped()
  @Query(() => DashboardAnalytics)
  dashboardAnalytics(): Promise<DashboardAnalytics> {
    return this.analytics.dashboard(this.organizationId());
  }

  @OrganizationScoped()
  @Query(() => ContactTrendsAnalytics)
  contactTrends(
    @Args('period', { type: () => ContactAnalyticsPeriod, nullable: true })
    period?: ContactAnalyticsPeriod,
  ): Promise<ContactTrendsAnalytics> {
    return this.analytics.contactTrends(this.organizationId(), period);
  }

  @OrganizationScoped()
  @Query(() => DealPerformanceAnalytics)
  dealPerformance(
    @Args('period', { type: () => DealAnalyticsPeriod, nullable: true })
    period?: DealAnalyticsPeriod,
  ): Promise<DealPerformanceAnalytics> {
    return this.analytics.dealPerformance(this.organizationId(), period);
  }

  @OrganizationScoped()
  @Query(() => BookingAnalytics)
  bookingAnalytics(): Promise<BookingAnalytics> {
    return this.analytics.bookingAnalytics(this.organizationId());
  }

  @OrganizationScoped()
  @Query(() => CommunicationStatsAnalytics)
  communicationStats(
    @Args('period', { type: () => CommunicationAnalyticsPeriod, nullable: true })
    period?: CommunicationAnalyticsPeriod,
  ): Promise<CommunicationStatsAnalytics> {
    return this.analytics.communicationStats(this.organizationId(), period);
  }

  @OrganizationScoped()
  @Query(() => WorkflowPerformanceAnalytics)
  workflowPerformance(): Promise<WorkflowPerformanceAnalytics> {
    return this.analytics.workflowPerformance(this.organizationId());
  }

  @OrganizationScoped()
  @Query(() => ReputationAnalytics)
  reputationAnalytics(
    @Args('days', { type: () => Int, nullable: true }) days?: number,
  ): Promise<ReputationAnalytics> {
    return this.analytics.reputationAnalytics(this.organizationId(), days);
  }

  private organizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization) throw new Error('Verified organization context is unavailable');
    return organization.organizationId;
  }
}
