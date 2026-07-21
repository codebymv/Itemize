import type { DashboardAnalytics } from './analyticsApi';
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
        total active leads customers newThisMonth newThisWeek
        growth { month count }
      }
      deals {
        total open won lost openValue wonValue wonThisMonth
        bookedValue bookedThisMonth collectedValue collectedThisMonth
        funnel { stageId stageName stageColor dealCount totalValue }
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
