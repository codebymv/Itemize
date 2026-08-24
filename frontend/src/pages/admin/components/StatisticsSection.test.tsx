import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as adminApi from '@/services/adminApi';
import StatisticsSection from './StatisticsSection';
import { formatMedian } from './activationFunnelFormat';

vi.mock('@/services/adminApi', () => ({
    getStats: vi.fn(),
    getActivationFunnel: vi.fn(),
}));

const funnel: adminApi.ActivationFunnel = {
    asOf: '2026-08-24T12:00:00.000Z',
    cohortStartedAt: '2026-07-25T12:00:00.000Z',
    cohortDays: 30,
    organizationsCreated: 10,
    organizationsVerified: 8,
    organizationsWorkspaceActivated: 6,
    organizationsTrialStarted: 5,
    organizationsContactCreated: 4,
    organizationsArtifactCreated: 4,
    organizationsSent: 3,
    organizationsAdvanced: 2,
    organizationsReturned: 2,
    organizationsCheckoutStarted: 2,
    organizationsSubscriptionActivated: 1,
    trialOrganizationsSent: 2,
    organizationsTrialToPaid: 1,
    sendRate: 0.3,
    verificationRate: 0.8,
    workspaceActivationRate: 0.75,
    trialStartRate: 0.625,
    contactCreationRate: 0.5,
    artifactCreationRate: 0.5,
    artifactToSendRate: 0.75,
    checkoutStartRate: 0.25,
    subscriptionActivationRate: 0.5,
    advanceRate: 2 / 3,
    returnRate: 2 / 3,
    trialToPaidRate: 0.5,
    medianHoursToWorkspace: 0.5,
    medianHoursToTrial: 1.25,
    medianHoursToContact: 24,
    medianHoursToArtifact: 48,
    medianHoursToSend: 72,
    medianHoursToAdvance: 2,
    medianHoursToCheckout: 96,
    medianHoursToSubscription: 120,
};

describe('StatisticsSection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(adminApi.getStats).mockResolvedValue({ users: 12, contacts: 7, invoices: 3 });
        vi.mocked(adminApi.getActivationFunnel).mockResolvedValue(funnel);
    });

    it('renders the complete activation journey in reusable mobile rails', async () => {
        render(<StatisticsSection />);

        await waitFor(() => expect(screen.getByText('Activation funnel')).toBeInTheDocument());
        expect(adminApi.getActivationFunnel).toHaveBeenCalledWith(30);
        expect(screen.getByRole('region', { name: 'System totals' })).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Setup and first value funnel' })).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Conversion and retention funnel' })).toBeInTheDocument();
        expect(screen.getByText('Workspace activated')).toBeInTheDocument();
        expect(screen.getByText('Checkout started')).toBeInTheDocument();
        expect(screen.getByText('Subscription activated')).toBeInTheDocument();
        expect(screen.getByText('6 orgs · Median 30m')).toBeInTheDocument();
    });

    it('formats activation timing compactly', () => {
        expect(formatMedian(null)).toBe('Median —');
        expect(formatMedian(0.25)).toBe('Median 15m');
        expect(formatMedian(3.25)).toBe('Median 3.3h');
        expect(formatMedian(36)).toBe('Median 1.5d');
    });
});
