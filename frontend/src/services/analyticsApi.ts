/**
 * Analytics API Service
 * Handles all analytics and reporting API calls
 */
import api from '@/lib/api';

const unwrapResponse = <T>(payload: any): T => {
    if (payload && typeof payload === 'object' && 'data' in payload) {
        return payload.data as T;
    }
    return payload as T;
};

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
    totalValue: number;
}

export interface RecentActivity {
    id: number;
    type: string;
    title: string;
    content: string;
    createdAt: string;
    contactId: number | null;
}

export interface DashboardAnalytics {
    contacts: {
        total: number;
        active: number;
        leads: number;
        customers: number;
        newThisMonth: number;
        newThisWeek: number;
        growth: ContactGrowth[];
    };
    deals: {
        total: number;
        open: number;
        won: number;
        lost: number;
        openValue: number;
        wonValue: number;
        wonThisMonth: number;
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
}

export interface DealPerformance {
    period: string;
    metrics: {
        closedTotal: number;
        wonCount: number;
        lostCount: number;
        winRate: number;
        avgDealValue: string;
        totalRevenue: string;
        avgDaysToClose: number;
    };
}

export interface ContactTrends {
    period: string;
    data: {
        period: string;
        newContacts: number;
        withSource: number;
    }[];
}

export interface BookingSummary {
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
    period: string;
    conversions: {
        leadToCustomer: {
            rate: number;
            leads: number;
            customers: number;
            total: number;
        };
        dealWinRate: {
            rate: number;
            won: number;
            lost: number;
            totalClosed: number;
            wonValue: number;
            lostValue: number;
        };
        formToContact: {
            rate: number;
            submissions: number;
            converted: number;
        };
        pipelines: Array<{
            pipelineName: string;
            stages: any[];
            stageCounts: Record<string, number>;
        }>;
    };
}

export interface RevenueTrend {
    period: string;
    dealsWon: number;
    revenue: number;
    cumulativeRevenue: number;
}

export interface RevenueTrends {
    period: string;
    data: RevenueTrend[];
    summary: {
        totalRevenue: number;
        totalDeals: number;
        avgDealValue: number;
        growthRate: number;
    };
}

export interface PipelineVelocityStage {
    stageId: string;
    stageName: string;
    stageColor: string;
    stageOrder: number;
    dealCount: number;
    totalValue: number;
    avgAgeDays: number;
    isBottleneck: boolean;
}

export interface PipelineVelocity {
    pipeline: {
        id: number;
        name: string;
    } | null;
    velocity: PipelineVelocityStage[];
    summary: {
        avgDaysToWin: number;
        avgDaysToLose: number;
        avgWonValue: number;
        openDeals: number;
        wonDeals: number;
        lostDeals: number;
        winRate: number;
    };
}

export interface CommunicationStats {
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
        stats: any;
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
    const response = await api.get('/api/analytics/dashboard', {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return unwrapResponse<DashboardAnalytics>(response.data);
};

/**
 * Get contact trends over time
 */
export const getContactTrends = async (
    period: '7days' | '30days' | '6months' | '12months' = '6months',
    organizationId?: number
): Promise<ContactTrends> => {
    const response = await api.get('/api/analytics/contacts/trends', {
        params: { period },
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return unwrapResponse<ContactTrends>(response.data);
};

/**
 * Get deal performance metrics
 */
export const getDealPerformance = async (
    period: '30days' | '6months' | '12months' = '6months',
    organizationId?: number
): Promise<DealPerformance> => {
    const response = await api.get('/api/analytics/deals/performance', {
        params: { period },
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return unwrapResponse<DealPerformance>(response.data);
};

/**
 * Get booking summary
 */
export const getBookingSummary = async (organizationId?: number): Promise<BookingSummary> => {
    const response = await api.get('/api/analytics/bookings/summary', {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return unwrapResponse<BookingSummary>(response.data);
};

/**
 * Get conversion rate metrics
 */
export const getConversionRates = async (
    period: '7days' | '30days' | '90days' | '12months' = '30days',
    organizationId?: number
): Promise<ConversionRates> => {
    const response = await api.get('/api/analytics/conversion-rates', {
        params: { period },
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return unwrapResponse<ConversionRates>(response.data);
};

/**
 * Get revenue trends over time
 */
export const getRevenueTrends = async (
    period: '30days' | '6months' | '12months' = '6months',
    organizationId?: number
): Promise<RevenueTrends> => {
    const response = await api.get('/api/analytics/revenue-trends', {
        params: { period },
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return unwrapResponse<RevenueTrends>(response.data);
};

/**
 * Get pipeline velocity metrics
 */
export const getPipelineVelocity = async (
    pipelineId?: number,
    organizationId?: number
): Promise<PipelineVelocity> => {
    const response = await api.get('/api/analytics/pipeline-velocity', {
        params: pipelineId ? { pipeline_id: pipelineId } : {},
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return unwrapResponse<PipelineVelocity>(response.data);
};

/**
 * Get communication (email/SMS) statistics
 */
export const getCommunicationStats = async (
    period: '7days' | '30days' | '90days' = '30days',
    organizationId?: number
): Promise<CommunicationStats> => {
    const response = await api.get('/api/analytics/communication-stats', {
        params: { period },
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return unwrapResponse<CommunicationStats>(response.data);
};

/**
 * Get workflow performance metrics
 */
export const getWorkflowPerformance = async (organizationId?: number): Promise<WorkflowPerformance> => {
    const response = await api.get('/api/analytics/workflow-performance', {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return unwrapResponse<WorkflowPerformance>(response.data);
};

export default {
    getDashboardAnalytics,
    getContactTrends,
    getDealPerformance,
    getBookingSummary,
    getConversionRates,
    getRevenueTrends,
    getPipelineVelocity,
    getCommunicationStats,
    getWorkflowPerformance,
};
