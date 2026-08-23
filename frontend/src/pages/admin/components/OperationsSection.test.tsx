import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as adminApi from '@/services/adminApi';
import OperationsSection from './OperationsSection';

vi.mock('@/services/adminApi', () => ({
    getOperationsSnapshot: vi.fn(),
}));

const getOperationsSnapshot = vi.mocked(adminApi.getOperationsSnapshot);

describe('OperationsSection', () => {
    beforeEach(() => {
        getOperationsSnapshot.mockReset();
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
        expect(screen.getByText('Operations query completed successfully')).toBeInTheDocument();
    });

    it('shows an explicit error state instead of zeroes', async () => {
        getOperationsSnapshot.mockRejectedValue(new Error('offline'));
        render(<OperationsSection />);
        await waitFor(() => expect(screen.getByText('Unable to load operations')).toBeInTheDocument());
        expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    });
});
