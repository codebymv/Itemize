import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import {
  getBookingSummary,
  getCommunicationStats,
  getContactTrends,
  getConversionRates,
  getDashboardAnalytics,
  getDealPerformance,
  getPipelineVelocity,
  getRevenueTrends,
  getWorkflowPerformance,
} from './analyticsApi';
import {
  getBookingAnalyticsViaGraphql,
  getCommunicationStatsViaGraphql,
  getContactTrendsViaGraphql,
  getDashboardAnalyticsViaGraphql,
  getDealPerformanceViaGraphql,
  getWorkflowPerformanceViaGraphql,
} from './analyticsGraphql';

vi.mock('@/lib/api', () => ({ default: { get: vi.fn() } }));
vi.mock('./analyticsGraphql', () => ({
  getDashboardAnalyticsViaGraphql: vi.fn(),
  getContactTrendsViaGraphql: vi.fn(),
  getDealPerformanceViaGraphql: vi.fn(),
  getBookingAnalyticsViaGraphql: vi.fn(),
  getCommunicationStatsViaGraphql: vi.fn(),
  getWorkflowPerformanceViaGraphql: vi.fn(),
}));

const dashboard = {
  contacts: {
    total: 0,
    active: 0,
    leads: 0,
    customers: 0,
    newThisMonth: 0,
    newThisWeek: 0,
    growth: [],
  },
  deals: {
    total: 0,
    open: 0,
    won: 0,
    lost: 0,
    openValue: 0,
    wonValue: 0,
    wonThisMonth: 0,
    funnel: [],
  },
  bookings: {
    total: 0,
    confirmed: 0,
    pending: 0,
    cancelled: 0,
    upcomingThisWeek: 0,
    upcomingToday: 0,
  },
  tasks: { total: 0, pending: 0, inProgress: 0, completed: 0, overdue: 0 },
  pipelines: { total: 0 },
  recentActivity: [],
};

describe('analytics transport boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('always delegates the dashboard snapshot to GraphQL', async () => {
    vi.mocked(getDashboardAnalyticsViaGraphql).mockResolvedValue(dashboard);

    await expect(getDashboardAnalytics(4)).resolves.toBe(dashboard);
    expect(getDashboardAnalyticsViaGraphql).toHaveBeenCalledWith(4);
    expect(api.get).not.toHaveBeenCalled();
  });

  it('always delegates the five approved dedicated reads to GraphQL', async () => {
    vi.mocked(getContactTrendsViaGraphql).mockResolvedValue({
      period: '7days',
      data: [],
    });
    vi.mocked(getDealPerformanceViaGraphql).mockResolvedValue({
      period: '12months',
      metrics: {
        closedTotal: 0,
        wonCount: 0,
        lostCount: 0,
        winRate: 0,
        avgDealValue: 0,
        totalRevenue: 0,
        avgDaysToClose: 0,
      },
    });
    vi.mocked(getBookingAnalyticsViaGraphql).mockResolvedValue({
      total: 0,
      confirmed: 0,
      completed: 0,
      cancelled: 0,
      noShow: 0,
      createdThisMonth: 0,
      upcoming: 0,
      completionRate: 0,
    });
    vi.mocked(getCommunicationStatsViaGraphql).mockResolvedValue({
      period: '90days',
      email: {
        total: 0,
        sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        bounced: 0,
        failed: 0,
        rates: { delivery: 0, open: 0, click: 0 },
      },
      sms: {
        total: 0,
        outbound: 0,
        inbound: 0,
        sent: 0,
        delivered: 0,
        failed: 0,
        segments: 0,
        rates: { delivery: 0 },
      },
    });
    vi.mocked(getWorkflowPerformanceViaGraphql).mockResolvedValue({
      workflows: [],
      summary: {
        totalWorkflows: 0,
        activeWorkflows: 0,
        totalEnrollments: 0,
        completedEnrollments: 0,
        activeEnrollments: 0,
        failedEnrollments: 0,
        overallCompletionRate: 0,
      },
    });

    await getContactTrends('7days', 4);
    await getDealPerformance('12months', 4);
    await getBookingSummary(4);
    await getCommunicationStats('90days', 4);
    await getWorkflowPerformance(4);

    expect(getContactTrendsViaGraphql).toHaveBeenCalledWith('7days', 4);
    expect(getDealPerformanceViaGraphql).toHaveBeenCalledWith('12months', 4);
    expect(getBookingAnalyticsViaGraphql).toHaveBeenCalledWith(4);
    expect(getCommunicationStatsViaGraphql).toHaveBeenCalledWith('90days', 4);
    expect(getWorkflowPerformanceViaGraphql).toHaveBeenCalledWith(4);
    expect(api.get).not.toHaveBeenCalled();
  });

  it('retains only the three blocked business-definition reads on HTTP', async () => {
    const conversion = { period: '30days', conversions: {} };
    const revenue = { period: '6months', data: [], summary: {} };
    const velocity = { pipeline: null, velocity: [], summary: {} };
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: { data: conversion } })
      .mockResolvedValueOnce({ data: { data: revenue } })
      .mockResolvedValueOnce({ data: { data: velocity } });

    await expect(getConversionRates('30days', 4)).resolves.toBe(conversion);
    await expect(getRevenueTrends('6months', 4)).resolves.toBe(revenue);
    await expect(getPipelineVelocity(17, 4)).resolves.toBe(velocity);

    expect(api.get).toHaveBeenNthCalledWith(1, '/api/analytics/conversion-rates', {
      params: { period: '30days' },
      headers: { 'x-organization-id': '4' },
    });
    expect(api.get).toHaveBeenNthCalledWith(2, '/api/analytics/revenue-trends', {
      params: { period: '6months' },
      headers: { 'x-organization-id': '4' },
    });
    expect(api.get).toHaveBeenNthCalledWith(3, '/api/analytics/pipeline-velocity', {
      params: { pipeline_id: 17 },
      headers: { 'x-organization-id': '4' },
    });
  });
});
