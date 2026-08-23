import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as adminApi from '@/services/adminApi';
import CommunicationsSection from './CommunicationsSection';

vi.mock('@/services/adminApi', () => ({
    getUserCount: vi.fn(),
    searchUsers: vi.fn(),
}));

describe('CommunicationsSection', () => {
    beforeEach(() => {
        vi.mocked(adminApi.getUserCount).mockResolvedValue({ count: 0 });
        vi.mocked(adminApi.searchUsers).mockResolvedValue({
            users: [],
            total: 0,
            hasMore: false,
        });
    });

    it('uses the shared admin icon hover and active colors for its tabs', async () => {
        render(<CommunicationsSection />);

        await screen.findByText('No users found');

        const usersTab = screen.getByRole('tab', { name: 'Users' });
        const emailLogsTab = screen.getByRole('tab', { name: 'Email Logs' });

        expect(usersTab).toHaveClass('group/tab');
        expect(usersTab.querySelector('svg')).toHaveClass('text-blue-600', 'transition-colors');
        expect(usersTab.querySelector('svg')).not.toHaveClass('group-hover/tab:text-blue-600');

        expect(emailLogsTab).toHaveClass('group/tab');
        expect(emailLogsTab.querySelector('svg')).toHaveClass(
            'text-gray-600',
            'dark:text-gray-400',
            'group-hover/tab:text-blue-600',
            'transition-colors',
        );
    });
});
