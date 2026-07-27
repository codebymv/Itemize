import type {
  BookingSummary,
  CommunicationStats,
  ContactTrends,
  ConversionRates,
  DashboardAnalytics,
  DealPerformance,
  PipelineDealAge,
  RevenueTrends,
  WorkflowPerformance,
} from './analyticsApi';
import { graphqlRequest } from './graphqlClient';

type GraphqlDashboardAnalytics = Omit<
  DashboardAnalytics,
  'invoiceMetrics' | 'signatureMetrics'
> & {
  asOf: string;
  reportingTimezone: string;
  invoiceMetrics: Omit<NonNullable<DashboardAnalytics['invoiceMetrics']>, 'recentInvoices'> & {
    recentInvoices: Array<{
      id: number;
      number: string;
      amount: number;
      status: string;
    }>;
  };
  signatureMetrics: Omit<NonNullable<DashboardAnalytics['signatureMetrics']>, 'recentDocuments'> & {
    recentDocuments: Array<{
      id: number;
      title: string;
      status: string;
      date: string;
    }>;
  };
};

const dashboardAnalyticsQuery = `
  query DashboardAnalytics {
    dashboardAnalytics {
      asOf
      reportingTimezone
      contacts {
        total active newThisMonth newThisWeek
        growth { month count }
      }
      deals {
        total open won lost
        funnel { stageId stageName stageColor dealCount }
      }
      bookings {
        total confirmed pending cancelled upcomingThisWeek upcomingToday
      }
      tasks { total pending inProgress completed overdue }
      pipelines { total }
      recentActivity { id type title content createdAt contactId }
      invoiceMetrics {
        pending overdue paidThisMonth countThisMonth
        recentInvoices { id number amount status }
      }
      signatureMetrics {
        awaiting signedThisWeek total
        recentDocuments { id title status date }
      }
      workspaceMetrics {
        activeItems lists notes
        recentItems { type title date }
      }
    }
  }
`;

export const getDashboardAnalyticsViaGraphql = async (
  organizationId?: number,
): Promise<DashboardAnalytics> => {
  const data = await graphqlRequest<
    { dashboardAnalytics: GraphqlDashboardAnalytics },
    Record<string, never>
  >(dashboardAnalyticsQuery, {}, organizationId);
  const result = data.dashboardAnalytics;
  return {
    ...result,
    invoiceMetrics: {
      ...result.invoiceMetrics,
      recentInvoices: result.invoiceMetrics.recentInvoices.map((invoice) => ({
        ...invoice,
        id: String(invoice.id),
      })),
    },
    signatureMetrics: {
      ...result.signatureMetrics,
      recentDocuments: result.signatureMetrics.recentDocuments.map((document) => ({
        ...document,
        id: String(document.id),
      })),
    },
  };
};

const contactTrendsQuery = `
  query ContactTrends($period: ContactAnalyticsPeriod) {
    contactTrends(period: $period) {
      asOf reportingTimezone period
      data { period newContacts withSource }
    }
  }
`;

const dealPerformanceQuery = `
  query DealPerformance($period: DealAnalyticsPeriod) {
    dealPerformance(period: $period) {
      asOf period
      metrics {
        closedTotal wonCount lostCount winRate avgDealValue totalRevenue avgDaysToClose
      }
    }
  }
`;

const bookingAnalyticsQuery = `
  query BookingAnalytics {
    bookingAnalytics {
      asOf total confirmed completed cancelled noShow createdThisMonth upcoming completionRate
    }
  }
`;

const communicationStatsQuery = `
  query CommunicationStats($period: CommunicationAnalyticsPeriod) {
    communicationStats(period: $period) {
      asOf period
      email {
        total sent delivered opened clicked bounced failed
        rates { delivery open click }
      }
      sms {
        total outbound inbound sent delivered failed segments
        rates { delivery }
      }
    }
  }
`;

const workflowPerformanceQuery = `
  query WorkflowPerformance {
    workflowPerformance {
      asOf
      workflows {
        id name triggerType isActive
        enrollments { total completed active failed }
        completionRate stats
      }
      summary {
        totalWorkflows activeWorkflows totalEnrollments completedEnrollments
        activeEnrollments failedEnrollments overallCompletionRate
      }
    }
  }
`;

const conversionRatesQuery = `
  query ConversionRates($period: ConversionAnalyticsPeriod) {
    conversionRates(period: $period) {
      asOf reportingTimezone period
      dealWinRate {
        rate won lost totalClosed
        valuesByCurrency { currency wonValue lostValue }
      }
      formToContact { rate submissions converted }
    }
  }
`;

const revenueTrendsQuery = `
  query RevenueTrends($period: RevenueAnalyticsPeriod) {
    revenueTrends(period: $period) {
      asOf reportingTimezone period
      currencies {
        currency
        data {
          period dealsWon paymentsCount bookedRevenue collectedRevenue
          cumulativeBookedRevenue cumulativeCollectedRevenue
        }
        summary {
          totalBookedRevenue totalCollectedRevenue totalDeals totalPayments
          averageBookedDealValue averageCollectedPayment
          bookedGrowthRate collectedGrowthRate
        }
      }
    }
  }
`;

const pipelineDealAgeQuery = `
  query PipelineDealAge($pipelineId: Int) {
    pipelineDealAge(pipelineId: $pipelineId) {
      asOf
      pipeline { id name }
      stages {
        stageId stageName stageColor stageOrder
        openDealCount averageOpenDealAgeDays
        openValueByCurrency { currency amount }
      }
      summary {
        averageDaysToWin averageDaysToLose openDeals wonDeals lostDeals winRate
      }
    }
  }
`;

const contactPeriods = {
  '7days': 'DAYS_7',
  '30days': 'DAYS_30',
  '6months': 'MONTHS_6',
  '12months': 'MONTHS_12',
} as const;

const dealPeriods = {
  '30days': 'DAYS_30',
  '6months': 'MONTHS_6',
  '12months': 'MONTHS_12',
} as const;

const communicationPeriods = {
  '7days': 'DAYS_7',
  '30days': 'DAYS_30',
  '90days': 'DAYS_90',
} as const;

const conversionPeriods = {
  '7days': 'DAYS_7',
  '30days': 'DAYS_30',
  '90days': 'DAYS_90',
  '12months': 'MONTHS_12',
} as const;

const revenuePeriods = {
  '30days': 'DAYS_30',
  '6months': 'MONTHS_6',
  '12months': 'MONTHS_12',
} as const;

export const getContactTrendsViaGraphql = async (
  period: keyof typeof contactPeriods,
  organizationId?: number,
): Promise<ContactTrends> => {
  const data = await graphqlRequest<
    { contactTrends: ContactTrends },
    { period: typeof contactPeriods[typeof period] }
  >(contactTrendsQuery, { period: contactPeriods[period] }, organizationId);
  return data.contactTrends;
};

export const getDealPerformanceViaGraphql = async (
  period: keyof typeof dealPeriods,
  organizationId?: number,
): Promise<DealPerformance> => {
  const data = await graphqlRequest<
    { dealPerformance: DealPerformance },
    { period: typeof dealPeriods[typeof period] }
  >(dealPerformanceQuery, { period: dealPeriods[period] }, organizationId);
  return data.dealPerformance;
};

export const getBookingAnalyticsViaGraphql = async (
  organizationId?: number,
): Promise<BookingSummary> => {
  const data = await graphqlRequest<
    { bookingAnalytics: BookingSummary },
    Record<string, never>
  >(bookingAnalyticsQuery, {}, organizationId);
  return data.bookingAnalytics;
};

export const getCommunicationStatsViaGraphql = async (
  period: keyof typeof communicationPeriods,
  organizationId?: number,
): Promise<CommunicationStats> => {
  const data = await graphqlRequest<
    { communicationStats: CommunicationStats },
    { period: typeof communicationPeriods[typeof period] }
  >(communicationStatsQuery, { period: communicationPeriods[period] }, organizationId);
  return data.communicationStats;
};

export const getWorkflowPerformanceViaGraphql = async (
  organizationId?: number,
): Promise<WorkflowPerformance> => {
  const data = await graphqlRequest<
    { workflowPerformance: WorkflowPerformance },
    Record<string, never>
  >(workflowPerformanceQuery, {}, organizationId);
  return data.workflowPerformance;
};

export const getConversionRatesViaGraphql = async (
  period: keyof typeof conversionPeriods,
  organizationId?: number,
): Promise<ConversionRates> => {
  const data = await graphqlRequest<
    { conversionRates: ConversionRates },
    { period: typeof conversionPeriods[typeof period] }
  >(conversionRatesQuery, { period: conversionPeriods[period] }, organizationId);
  return data.conversionRates;
};

export const getRevenueTrendsViaGraphql = async (
  period: keyof typeof revenuePeriods,
  organizationId?: number,
): Promise<RevenueTrends> => {
  const data = await graphqlRequest<
    { revenueTrends: RevenueTrends },
    { period: typeof revenuePeriods[typeof period] }
  >(revenueTrendsQuery, { period: revenuePeriods[period] }, organizationId);
  return data.revenueTrends;
};

export const getPipelineDealAgeViaGraphql = async (
  pipelineId?: number,
  organizationId?: number,
): Promise<PipelineDealAge> => {
  const data = await graphqlRequest<
    { pipelineDealAge: PipelineDealAge },
    { pipelineId?: number }
  >(
    pipelineDealAgeQuery,
    pipelineId === undefined ? {} : { pipelineId },
    organizationId,
  );
  return data.pipelineDealAge;
};
