/**
 * Analytics API Service
 * Handles all analytics and reporting API calls
 */
import api from '@/lib/api';

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
    description: string;
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
    return response.data;
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
    return response.data;
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
    return response.data;
};

/**
 * Get booking summary
 */
export const getBookingSummary = async (organizationId?: number): Promise<BookingSummary> => {
    const response = await api.get('/api/analytics/bookings/summary', {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export default {
    getDashboardAnalytics,
    getContactTrends,
    getDealPerformance,
    getBookingSummary,
};
