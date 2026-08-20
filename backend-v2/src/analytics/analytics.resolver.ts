import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { OrganizationScoped, RequiresPlan } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { AnalyticsService } from './analytics.service';
import {
  CommunicationAnalyticsPeriod,
  ContactAnalyticsPeriod,
  ConversionAnalyticsPeriod,
  DealAnalyticsPeriod,
  RevenueAnalyticsPeriod,
} from './analytics.enums';
import {
  BookingAnalytics,
  CommunicationStatsAnalytics,
  ContactTrendsAnalytics,
  ConversionAnalytics,
  DashboardAnalytics,
  DealPerformanceAnalytics,
  PipelineDealAgeAnalytics,
  ReputationAnalytics,
  RevenueTrendsAnalytics,
  WorkflowPerformanceAnalytics,
} from './analytics.types';

@RequiresPlan()
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
  @Query(() => ConversionAnalytics)
  conversionRates(
    @Args('period', { type: () => ConversionAnalyticsPeriod, nullable: true })
    period?: ConversionAnalyticsPeriod,
  ): Promise<ConversionAnalytics> {
    return this.analytics.conversionRates(this.organizationId(), period);
  }

  @OrganizationScoped()
  @Query(() => RevenueTrendsAnalytics)
  revenueTrends(
    @Args('period', { type: () => RevenueAnalyticsPeriod, nullable: true })
    period?: RevenueAnalyticsPeriod,
  ): Promise<RevenueTrendsAnalytics> {
    return this.analytics.revenueTrends(this.organizationId(), period);
  }

  @OrganizationScoped()
  @Query(() => PipelineDealAgeAnalytics)
  pipelineDealAge(
    @Args('pipelineId', { type: () => Int, nullable: true }) pipelineId?: number,
  ): Promise<PipelineDealAgeAnalytics> {
    return this.analytics.pipelineDealAge(this.organizationId(), pipelineId);
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
