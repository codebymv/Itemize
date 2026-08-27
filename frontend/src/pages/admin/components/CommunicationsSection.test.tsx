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

        expect(usersTab).toHaveAttribute('data-state', 'active');
        expect(usersTab).toHaveClass(
            'icon-tabs-trigger',
            'hover:bg-sidebar-accent',
            'dark:hover:bg-blue-900/40',
            'data-[state=active]:bg-sidebar-accent',
            'data-[state=active]:hover:bg-background',
            '[&>svg]:transition-colors',
        );

        expect(emailLogsTab).toHaveAttribute('data-state', 'inactive');
        expect(emailLogsTab).toHaveClass(
            'icon-tabs-trigger',
            'hover:bg-sidebar-accent',
            '[&>svg]:transition-colors',
        );
    });
});
