import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as adminApi from '@/services/adminApi';
import OperationsSection from './OperationsSection';

vi.mock('@/services/adminApi', () => ({
    getOperationsSnapshot: vi.fn(),
    getJobQueueDetails: vi.fn(),
}));

const getOperationsSnapshot = vi.mocked(adminApi.getOperationsSnapshot);
const getJobQueueDetails = vi.mocked(adminApi.getJobQueueDetails);

describe('OperationsSection', () => {
    beforeEach(() => {
        getOperationsSnapshot.mockReset();
        getJobQueueDetails.mockReset();
    });

    it('renders provider configuration and actionable queue state', async () => {
        getOperationsSnapshot.mockResolvedValue({
            asOf: '2026-08-22T12:00:00.000Z',
            status: 'action_required',
            activeJobs: 4,
            retryingJobs: 1,
            actionRequiredJobs: 2,
            providers: [
                {
                    id: 'database', name: 'PostgreSQL', status: 'operational',
                    detail: 'Operations query completed successfully', required: true,
                },
            ],
            queues: [
                {
                    id: 'messages', name: 'Direct messages', status: 'action_required',
                    available: true, queued: 2, processing: 1, retrying: 1,
                    actionRequired: 2, active: 4, oldestPendingAt: '2026-08-22T11:00:00.000Z',
                },
            ],
        });

        render(<OperationsSection />);

        await waitFor(() => expect(screen.getByText('PostgreSQL')).toBeInTheDocument());
        expect(screen.getAllByText('Action required').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Direct messages').length).toBeGreaterThan(0);
        expect(screen.queryByText('Operations query completed successfully')).not.toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Operations summary' })).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Provider health' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    });

    it('shows an explicit error state instead of zeroes', async () => {
        getOperationsSnapshot.mockRejectedValue(new Error('offline'));
        render(<OperationsSection />);
        await waitFor(() => expect(screen.getByText('Unable to load operations')).toBeInTheDocument());
        expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    });

    it('loads bounded queue details on demand and explains an unclaimed backlog', async () => {
        getOperationsSnapshot.mockResolvedValue({
            asOf: '2026-08-22T12:00:00.000Z', status: 'degraded',
            activeJobs: 70, retryingJobs: 0, actionRequiredJobs: 0, providers: [],
            queues: [{
                id: 'realtime', name: 'Realtime events', status: 'degraded', available: true,
                queued: 70, processing: 0, retrying: 0, actionRequired: 0, active: 70,
                oldestPendingAt: '2026-08-18T00:00:00.000Z',
            }],
        });
        getJobQueueDetails.mockResolvedValue({
            queueId: 'realtime', name: 'Realtime events', bucket: 'all', available: true,
            total: 70, hasMore: true,
            kindCounts: [
                { kind: 'CONTENT_CHANGED', count: 19 },
                { kind: 'POSITION_UPDATE', count: 7 },
            ],
            items: [{
                id: '42', status: 'queued', createdAt: '2026-08-18T00:00:00.000Z',
                attemptCount: 0, nextAttemptAt: '2026-08-18T00:00:00.000Z',
                leaseExpiresAt: null, kind: 'noteUpdated', reference: null, lastError: null,
            }],
        });

        render(<OperationsSection />);
        const detailsButtons = await screen.findAllByRole('button', { name: 'Details' });
        fireEvent.click(detailsButtons[0]);

        await waitFor(() => expect(screen.getAllByText('Realtime events details').length).toBeGreaterThan(0));
        expect(getJobQueueDetails).toHaveBeenCalledWith('realtime', 'all', 25, 0);
        expect((await screen.findAllByText(/No delivery attempts are recorded/)).length).toBeGreaterThan(0);
        expect(screen.getAllByText('noteUpdated').length).toBeGreaterThan(0);
        expect(screen.getAllByText('By event type').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Content Changed').length).toBeGreaterThan(0);
        expect(screen.getAllByText('19').length).toBeGreaterThan(0);
        expect(screen.getByText('Outstanding jobs')).toBeInTheDocument();
    });
});
