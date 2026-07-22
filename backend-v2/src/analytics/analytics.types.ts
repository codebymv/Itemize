import { Field, Float, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';

@ObjectType()
export class AnalyticsContactGrowth {
  @Field(() => String)
  month: string;

  @Field(() => Float)
  count: number;
}

@ObjectType()
export class DashboardContactMetrics {
  @Field(() => Float)
  total: number;

  @Field(() => Float)
  active: number;

  @Field(() => Float, {
    deprecationReason: 'Contact status does not define a lead lifecycle. Retained for REST parity only.',
  })
  leads: number;

  @Field(() => Float, {
    deprecationReason: 'Contact status does not define a customer lifecycle. Retained for REST parity only.',
  })
  customers: number;

  @Field(() => Float)
  newThisMonth: number;

  @Field(() => Float)
  newThisWeek: number;

  @Field(() => [AnalyticsContactGrowth])
  growth: AnalyticsContactGrowth[];
}

@ObjectType()
export class DashboardFunnelStage {
  @Field(() => String)
  stageId: string;

  @Field(() => String)
  stageName: string;

  @Field(() => String)
  stageColor: string;

  @Field(() => Float)
  dealCount: number;

  @Field(() => Float)
  totalValue: number;
}

@ObjectType()
export class DashboardDealMetrics {
  @Field(() => Float)
  total: number;

  @Field(() => Float)
  open: number;

  @Field(() => Float)
  won: number;

  @Field(() => Float)
  lost: number;

  @Field(() => Float)
  openValue: number;

  @Field(() => Float, {
    deprecationReason: 'Mixes booked deals and collected payments. Use bookedValue and collectedValue.',
  })
  wonValue: number;

  @Field(() => Float, {
    deprecationReason: 'Mixes booked deals and collected payments. Use bookedThisMonth and collectedThisMonth.',
  })
  wonThisMonth: number;

  @Field(() => Float)
  bookedValue: number;

  @Field(() => Float)
  bookedThisMonth: number;

  @Field(() => Float)
  collectedValue: number;

  @Field(() => Float)
  collectedThisMonth: number;

  @Field(() => [DashboardFunnelStage])
  funnel: DashboardFunnelStage[];
}

@ObjectType()
export class DashboardBookingMetrics {
  @Field(() => Float)
  total: number;

  @Field(() => Float)
  confirmed: number;

  @Field(() => Float)
  pending: number;

  @Field(() => Float)
  cancelled: number;

  @Field(() => Float)
  upcomingThisWeek: number;

  @Field(() => Float)
  upcomingToday: number;
}

@ObjectType()
export class DashboardTaskMetrics {
  @Field(() => Float)
  total: number;

  @Field(() => Float)
  pending: number;

  @Field(() => Float)
  inProgress: number;

  @Field(() => Float)
  completed: number;

  @Field(() => Float)
  overdue: number;
}

@ObjectType()
export class DashboardPipelineMetrics {
  @Field(() => Float)
  total: number;
}

@ObjectType()
export class DashboardRecentActivity {
  @Field(() => Int)
  id: number;

  @Field(() => String)
  type: string;

  @Field(() => String)
  title: string;

  @Field(() => GraphQLJSON, { nullable: true })
  content: unknown | null;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => Int, { nullable: true })
  contactId: number | null;
}

@ObjectType()
export class DashboardRecentInvoice {
  @Field(() => Int)
  id: number;

  @Field(() => String)
  number: string;

  @Field(() => Float)
  amount: number;

  @Field(() => String)
  status: string;
}

@ObjectType()
export class DashboardInvoiceMetrics {
  @Field(() => Float)
  pending: number;

  @Field(() => Float)
  overdue: number;

  @Field(() => Float)
  paidThisMonth: number;

  @Field(() => Float)
  countThisMonth: number;

  @Field(() => [DashboardRecentInvoice])
  recentInvoices: DashboardRecentInvoice[];
}

@ObjectType()
export class DashboardRecentSignature {
  @Field(() => Int)
  id: number;

  @Field(() => String)
  title: string;

  @Field(() => String)
  status: string;

  @Field(() => GraphQLISODateTime)
  date: Date;
}

@ObjectType()
export class DashboardSignatureMetrics {
  @Field(() => Float)
  awaiting: number;

  @Field(() => Float)
  signedThisWeek: number;

  @Field(() => Float)
  total: number;

  @Field(() => [DashboardRecentSignature])
  recentDocuments: DashboardRecentSignature[];
}

@ObjectType()
export class DashboardRecentWorkspaceItem {
  @Field(() => String)
  type: string;

  @Field(() => String)
  title: string;

  @Field(() => GraphQLISODateTime)
  date: Date;
}

@ObjectType()
export class DashboardWorkspaceMetrics {
  @Field(() => Float)
  activeItems: number;

  @Field(() => Float)
  lists: number;

  @Field(() => Float)
  notes: number;

  @Field(() => [DashboardRecentWorkspaceItem])
  recentItems: DashboardRecentWorkspaceItem[];
}

@ObjectType()
export class DashboardAnalytics {
  @Field(() => GraphQLISODateTime)
  asOf: Date;

  @Field(() => String)
  reportingTimezone: string;

  @Field(() => DashboardContactMetrics)
  contacts: DashboardContactMetrics;

  @Field(() => DashboardDealMetrics)
  deals: DashboardDealMetrics;

  @Field(() => DashboardBookingMetrics)
  bookings: DashboardBookingMetrics;

  @Field(() => DashboardTaskMetrics)
  tasks: DashboardTaskMetrics;

  @Field(() => DashboardPipelineMetrics)
  pipelines: DashboardPipelineMetrics;

  @Field(() => [DashboardRecentActivity])
  recentActivity: DashboardRecentActivity[];

  @Field(() => DashboardInvoiceMetrics)
  invoiceMetrics: DashboardInvoiceMetrics;

  @Field(() => DashboardSignatureMetrics)
  signatureMetrics: DashboardSignatureMetrics;

  @Field(() => DashboardWorkspaceMetrics)
  workspaceMetrics: DashboardWorkspaceMetrics;
}

@ObjectType()
export class ContactTrendBucket {
  @Field(() => String)
  period: string;

  @Field(() => Float)
  newContacts: number;

  @Field(() => Float)
  withSource: number;
}

@ObjectType()
export class ContactTrendsAnalytics {
  @Field(() => GraphQLISODateTime)
  asOf: Date;

  @Field(() => String)
  reportingTimezone: string;

  @Field(() => String)
  period: string;

  @Field(() => [ContactTrendBucket])
  data: ContactTrendBucket[];
}

@ObjectType()
export class DealPerformanceMetrics {
  @Field(() => Float)
  closedTotal: number;

  @Field(() => Float)
  wonCount: number;

  @Field(() => Float)
  lostCount: number;

  @Field(() => Float)
  winRate: number;

  @Field(() => Float)
  avgDealValue: number;

  @Field(() => Float)
  totalRevenue: number;

  @Field(() => Float)
  avgDaysToClose: number;
}

@ObjectType()
export class DealPerformanceAnalytics {
  @Field(() => GraphQLISODateTime)
  asOf: Date;

  @Field(() => String)
  period: string;

  @Field(() => DealPerformanceMetrics)
  metrics: DealPerformanceMetrics;
}

@ObjectType()
export class BookingAnalytics {
  @Field(() => GraphQLISODateTime)
  asOf: Date;

  @Field(() => Float)
  total: number;

  @Field(() => Float)
  confirmed: number;

  @Field(() => Float)
  completed: number;

  @Field(() => Float)
  cancelled: number;

  @Field(() => Float)
  noShow: number;

  @Field(() => Float)
  createdThisMonth: number;

  @Field(() => Float)
  upcoming: number;

  @Field(() => Float)
  completionRate: number;
}

@ObjectType()
export class AnalyticsRates {
  @Field(() => Float)
  delivery: number;

  @Field(() => Float, { nullable: true })
  open?: number;

  @Field(() => Float, { nullable: true })
  click?: number;
}

@ObjectType()
export class EmailAnalyticsMetrics {
  @Field(() => Float)
  total: number;

  @Field(() => Float)
  sent: number;

  @Field(() => Float)
  delivered: number;

  @Field(() => Float)
  opened: number;

  @Field(() => Float)
  clicked: number;

  @Field(() => Float)
  bounced: number;

  @Field(() => Float)
  failed: number;

  @Field(() => AnalyticsRates)
  rates: AnalyticsRates;
}

@ObjectType()
export class SmsAnalyticsMetrics {
  @Field(() => Float)
  total: number;

  @Field(() => Float)
  outbound: number;

  @Field(() => Float)
  inbound: number;

  @Field(() => Float)
  sent: number;

  @Field(() => Float)
  delivered: number;

  @Field(() => Float)
  failed: number;

  @Field(() => Float)
  segments: number;

  @Field(() => AnalyticsRates)
  rates: AnalyticsRates;
}

@ObjectType()
export class CommunicationStatsAnalytics {
  @Field(() => GraphQLISODateTime)
  asOf: Date;

  @Field(() => String)
  period: string;

  @Field(() => EmailAnalyticsMetrics)
  email: EmailAnalyticsMetrics;

  @Field(() => SmsAnalyticsMetrics)
  sms: SmsAnalyticsMetrics;
}

@ObjectType()
export class WorkflowEnrollmentMetrics {
  @Field(() => Float)
  total: number;

  @Field(() => Float)
  completed: number;

  @Field(() => Float)
  active: number;

  @Field(() => Float)
  failed: number;
}

@ObjectType()
export class WorkflowAnalyticsMetrics {
  @Field(() => Int)
  id: number;

  @Field(() => String)
  name: string;

  @Field(() => String)
  triggerType: string;

  @Field(() => Boolean)
  isActive: boolean;

  @Field(() => WorkflowEnrollmentMetrics)
  enrollments: WorkflowEnrollmentMetrics;

  @Field(() => Float)
  completionRate: number;

  @Field(() => GraphQLJSON)
  stats: Record<string, unknown>;
}

@ObjectType()
export class WorkflowAnalyticsSummary {
  @Field(() => Float)
  totalWorkflows: number;

  @Field(() => Float)
  activeWorkflows: number;

  @Field(() => Float)
  totalEnrollments: number;

  @Field(() => Float)
  completedEnrollments: number;

  @Field(() => Float)
  activeEnrollments: number;

  @Field(() => Float)
  failedEnrollments: number;

  @Field(() => Float)
  overallCompletionRate: number;
}

@ObjectType()
export class WorkflowPerformanceAnalytics {
  @Field(() => GraphQLISODateTime)
  asOf: Date;

  @Field(() => [WorkflowAnalyticsMetrics])
  workflows: WorkflowAnalyticsMetrics[];

  @Field(() => WorkflowAnalyticsSummary)
  summary: WorkflowAnalyticsSummary;
}

@ObjectType()
export class ReputationOverallAnalytics {
  @Field(() => Float)
  totalReviews: number;

  @Field(() => Float)
  averageRating: number;

  @Field(() => Float)
  positiveReviews: number;

  @Field(() => Float)
  negativeReviews: number;

  @Field(() => Float)
  newReviews: number;

  @Field(() => Float)
  respondedReviews: number;
}

@ObjectType()
export class ReputationPeriodAnalytics {
  @Field(() => Int)
  days: number;

  @Field(() => Float)
  reviewsCount: number;

  @Field(() => Float)
  averageRating: number;
}

@ObjectType()
export class ReputationRatingDistribution {
  @Field(() => Int)
  rating: number;

  @Field(() => Float)
  count: number;
}

@ObjectType()
export class ReputationPlatformDistribution {
  @Field(() => String)
  platform: string;

  @Field(() => Float)
  count: number;

  @Field(() => Float)
  averageRating: number;
}

@ObjectType()
export class ReputationReviewTimeBucket {
  @Field(() => GraphQLISODateTime)
  date: Date;

  @Field(() => Float)
  count: number;

  @Field(() => Float)
  averageRating: number;
}

@ObjectType()
export class ReputationRequestAnalytics {
  @Field(() => Float)
  totalSent: number;

  @Field(() => Float)
  clicked: number;

  @Field(() => Float)
  converted: number;
}

@ObjectType()
export class ReputationAnalytics {
  @Field(() => GraphQLISODateTime)
  asOf: Date;

  @Field(() => String)
  reportingTimezone: string;

  @Field(() => ReputationOverallAnalytics)
  overall: ReputationOverallAnalytics;

  @Field(() => ReputationPeriodAnalytics)
  period: ReputationPeriodAnalytics;

  @Field(() => [ReputationRatingDistribution])
  ratingDistribution: ReputationRatingDistribution[];

  @Field(() => [ReputationPlatformDistribution])
  platformDistribution: ReputationPlatformDistribution[];

  @Field(() => [ReputationReviewTimeBucket])
  reviewsOverTime: ReputationReviewTimeBucket[];

  @Field(() => ReputationRequestAnalytics)
  requestStats: ReputationRequestAnalytics;
}
