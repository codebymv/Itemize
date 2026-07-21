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
