/**
 * Analytics API Service
 * Handles all analytics and reporting API calls
 */
import {
    getBookingAnalyticsViaGraphql,
    getCommunicationStatsViaGraphql,
    getContactTrendsViaGraphql,
    getConversionRatesViaGraphql,
    getDashboardAnalyticsViaGraphql,
    getDealPerformanceViaGraphql,
    getPipelineDealAgeViaGraphql,
    getRevenueTrendsViaGraphql,
    getWorkflowPerformanceViaGraphql,
} from './analyticsGraphql';

export interface WorkflowStats {
    [key: string]: unknown;
}

// ======================
// Types
// ======================

export interface ContactGrowth {
    month: string;
    count: number;
}

export interface FunnelStage {
    stageId: string;
    stageName: string;
    stageColor: string;
    dealCount: number;
}

export interface RecentActivity {
    id: number;
    type: string;
    title: string;
    content: unknown;
    createdAt: string;
    contactId: number | null;
}

export interface DashboardAnalytics {
    asOf?: string;
    reportingTimezone?: string;
    contacts: {
        total: number;
        active: number;
        newThisMonth: number;
        newThisWeek: number;
        growth: ContactGrowth[];
        recentContacts: Array<{
            id: string;
            name: string;
            email?: string;
        }>;
    };
    deals: {
        total: number;
        open: number;
        won: number;
        lost: number;
        funnel: FunnelStage[];
    };
    bookings: {
        total: number;
        confirmed: number;
        pending: number;
        cancelled: number;
        upcomingThisWeek: number;
        upcomingToday: number;
    };
    tasks: {
        total: number;
        pending: number;
        inProgress: number;
        completed: number;
        overdue: number;
    };
    pipelines: {
        total: number;
    };
    recentActivity: RecentActivity[];
    invoiceMetrics?: {
        pending: number;
        overdue: number;
        paidThisMonth: number;
        countThisMonth: number;
        recentInvoices: Array<{
            id: string;
            number: string;
            amount: number;
            status: string;
        }>;
    };
    signatureMetrics?: {
        awaiting: number;
        signedThisWeek: number;
        total: number;
        recentDocuments: Array<{
            id: string;
            title: string;
            status: string;
            date: string;
        }>;
    };
    workspaceMetrics?: {
        activeItems: number;
        lists: number;
        notes: number;
        recentItems: Array<{
            type: 'list' | 'note';
            title: string;
            date: string;
        }>;
    };
}

export interface DealPerformance {
    asOf?: string;
    period: string;
    metrics: {
        closedTotal: number;
        wonCount: number;
        lostCount: number;
        winRate: number;
        avgDealValue: number;
        totalRevenue: number;
        avgDaysToClose: number;
    };
}

export interface ContactTrends {
    asOf?: string;
    reportingTimezone?: string;
    period: string;
    data: {
        period: string;
        newContacts: number;
        withSource: number;
    }[];
}

export interface BookingSummary {
    asOf?: string;
    total: number;
    confirmed: number;
    completed: number;
    cancelled: number;
    noShow: number;
    createdThisMonth: number;
    upcoming: number;
    completionRate: number;
}

export interface ConversionRates {
    asOf?: string;
    reportingTimezone?: string;
    period: string;
    dealWinRate: {
        rate: number;
        won: number;
        lost: number;
        totalClosed: number;
        valuesByCurrency: Array<{
            currency: string;
            wonValue: number;
            lostValue: number;
        }>;
    };
    formToContact: {
        rate: number;
        submissions: number;
        converted: number;
    };
}

export interface RevenueTrend {
    period: string;
    dealsWon: number;
    paymentsCount: number;
    bookedRevenue: number;
    collectedRevenue: number;
    cumulativeBookedRevenue: number;
    cumulativeCollectedRevenue: number;
}

export interface RevenueCurrencyTrend {
    currency: string;
    data: RevenueTrend[];
    summary: {
        totalBookedRevenue: number;
        totalCollectedRevenue: number;
        totalDeals: number;
        totalPayments: number;
        averageBookedDealValue: number;
        averageCollectedPayment: number;
        bookedGrowthRate: number;
        collectedGrowthRate: number;
    };
}

export interface RevenueTrends {
    asOf?: string;
    reportingTimezone?: string;
    period: string;
    currencies: RevenueCurrencyTrend[];
}

export interface PipelineDealAgeStage {
    stageId: string;
    stageName: string;
    stageColor: string;
    stageOrder: number;
    openDealCount: number;
    averageOpenDealAgeDays: number;
    openValueByCurrency: Array<{
        currency: string;
        amount: number;
    }>;
}

export interface PipelineDealAge {
    asOf?: string;
    pipeline: {
        id: number;
        name: string;
    } | null;
    stages: PipelineDealAgeStage[];
    summary: {
        averageDaysToWin: number;
        averageDaysToLose: number;
        openDeals: number;
        wonDeals: number;
        lostDeals: number;
        winRate: number;
    };
}

export interface CommunicationStats {
    asOf?: string;
    period: string;
    email: {
        total: number;
        sent: number;
        delivered: number;
        opened: number;
        clicked: number;
        bounced: number;
        failed: number;
        rates: {
            delivery: number;
            open: number;
            click: number;
        };
    };
    sms: {
        total: number;
        outbound: number;
        inbound: number;
        sent: number;
        delivered: number;
        failed: number;
        segments: number;
        rates: {
            delivery: number;
        };
    };
}

export interface WorkflowPerformance {
    asOf?: string;
    workflows: Array<{
        id: number;
        name: string;
        triggerType: string;
        isActive: boolean;
        enrollments: {
            total: number;
            completed: number;
            active: number;
            failed: number;
        };
        completionRate: number;
        stats: WorkflowStats;
    }>;
    summary: {
        totalWorkflows: number;
        activeWorkflows: number;
        totalEnrollments: number;
        completedEnrollments: number;
        activeEnrollments: number;
        failedEnrollments: number;
        overallCompletionRate: number;
    };
}

// ======================
// API Functions
// ======================

/**
 * Get dashboard analytics summary
 */
export const getDashboardAnalytics = async (organizationId?: number): Promise<DashboardAnalytics> => {
    return getDashboardAnalyticsViaGraphql(organizationId);
};

/**
 * Get contact trends over time
 */
export const getContactTrends = async (
    period: '7days' | '30days' | '6months' | '12months' = '6months',
    organizationId?: number
): Promise<ContactTrends> => {
    return getContactTrendsViaGraphql(period, organizationId);
};

/**
 * Get deal performance metrics
 */
export const getDealPerformance = async (
    period: '30days' | '6months' | '12months' = '6months',
    organizationId?: number
): Promise<DealPerformance> => {
    return getDealPerformanceViaGraphql(period, organizationId);
};

/**
 * Get booking summary
 */
export const getBookingSummary = async (organizationId?: number): Promise<BookingSummary> => {
    return getBookingAnalyticsViaGraphql(organizationId);
};

/**
 * Get conversion rate metrics
 */
export const getConversionRates = async (
    period: '7days' | '30days' | '90days' | '12months' = '30days',
    organizationId?: number
): Promise<ConversionRates> => {
    return getConversionRatesViaGraphql(period, organizationId);
};

/**
 * Get revenue trends over time
 */
export const getRevenueTrends = async (
    period: '30days' | '6months' | '12months' = '6months',
    organizationId?: number
): Promise<RevenueTrends> => {
    return getRevenueTrendsViaGraphql(period, organizationId);
};

/**
 * Get current open-deal age and outcome-cycle metrics for a pipeline
 */
export const getPipelineDealAge = async (
    pipelineId?: number,
    organizationId?: number
): Promise<PipelineDealAge> => {
    return getPipelineDealAgeViaGraphql(pipelineId, organizationId);
};

/**
 * Get communication (email/SMS) statistics
 */
export const getCommunicationStats = async (
    period: '7days' | '30days' | '90days' = '30days',
    organizationId?: number
): Promise<CommunicationStats> => {
    return getCommunicationStatsViaGraphql(period, organizationId);
};

/**
 * Get workflow performance metrics
 */
export const getWorkflowPerformance = async (organizationId?: number): Promise<WorkflowPerformance> => {
    return getWorkflowPerformanceViaGraphql(organizationId);
};

export default {
    getDashboardAnalytics,
    getContactTrends,
    getDealPerformance,
    getBookingSummary,
    getConversionRates,
    getRevenueTrends,
    getPipelineDealAge,
    getCommunicationStats,
    getWorkflowPerformance,
};
