import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as adminApi from '@/services/adminApi';
import CommunicationsSection from './CommunicationsSection';

vi.mock('@/services/adminApi', () => ({
    getUserCount: vi.fn(),
    searchUsers: vi.fn(),
}));

vi.mock('@/services/adminEmailApi', () => ({
    getEmailLogs: vi.fn().mockResolvedValue({ logs: [], total: 0, hasMore: false }),
    getEmailLog: vi.fn(),
}));

function LocationProbe() {
    const location = useLocation();
    return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderSection(path = '/admin') {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <CommunicationsSection />
            <LocationProbe />
        </MemoryRouter>,
    );
}

describe('CommunicationsSection', () => {
    beforeEach(() => {
        vi.mocked(adminApi.getUserCount).mockResolvedValue({ count: 0 });
        vi.mocked(adminApi.searchUsers).mockResolvedValue({
            users: [],
            total: 0,
            hasMore: false,
        });
    });

    it('uses the shared sidebar surface and icon-only accent contract for its tabs', async () => {
        const { container } = renderSection();

        await screen.findByText('No users yet');

        const usersTab = screen.getByRole('tab', { name: 'Users' });
        const emailLogsTab = screen.getByRole('tab', { name: 'Email Logs' });

        expect(usersTab).toHaveAttribute('data-state', 'active');
        expect(usersTab).toHaveClass(
            'icon-tabs-trigger',
            'interaction-navigation',
            'data-[state=active]:bg-sidebar-accent',
            '[&>svg]:transition-colors',
        );
        expect(usersTab).not.toHaveClass('dark:hover:bg-blue-900/40');

        expect(emailLogsTab).toHaveAttribute('data-state', 'inactive');
        expect(emailLogsTab).toHaveClass(
            'icon-tabs-trigger',
            'interaction-navigation',
            '[&>svg]:transition-colors',
        );

        const header = container.querySelector('[data-communications-header]');
        const content = container.querySelector('[data-communications-content]');
        expect(header).toHaveClass(
            'flex-col',
            'min-[1000px]:flex-row',
            'min-[1000px]:justify-between',
        );
        expect(container.querySelector('[data-communications-count]')).toHaveTextContent('0 users');
        expect(content?.parentElement).toHaveAttribute('data-communications-section');
    });

    it('restores the Email Logs mode from URL state', async () => {
        const { container } = renderSection('/admin?view=email-logs');

        expect(await screen.findByRole('tab', { name: 'Email Logs' })).toHaveAttribute('data-state', 'active');
        expect(screen.getByTestId('location')).toHaveTextContent('/admin?view=email-logs');
        expect(await screen.findByText('No emails sent yet')).toBeInTheDocument();
        expect(container.querySelector('[data-communications-count]')).toHaveTextContent('0 emails sent');
        expect(container.querySelector('[data-email-logs-content]')?.parentElement).toHaveAttribute(
            'data-communications-section',
        );
        expect(screen.getAllByText('Email Logs')).toHaveLength(1);
    });

    it('keeps the user count and selection controls in the shared responsive header', async () => {
        vi.mocked(adminApi.getUserCount).mockResolvedValue({ count: 11 });
        vi.mocked(adminApi.searchUsers).mockResolvedValue({
            users: [{
                id: 1,
                email: 'qa@itemize.test',
                name: 'Itemize QA',
                role: 'ADMIN',
                plan: 'STUDIO',
                createdAt: '2026-08-28T00:00:00.000Z',
            }],
            total: 11,
            hasMore: true,
        });

        const { container } = renderSection();
        const selectVisible = await screen.findByRole('button', { name: 'Select visible (1)' });
        const selectAll = screen.getByRole('button', { name: 'Select all (11)' });
        const header = container.querySelector('[data-communications-header]');

        expect(container.querySelector('[data-communications-count]')).toHaveTextContent('11 users');
        expect(header).toContainElement(selectVisible);
        expect(header).toContainElement(selectAll);
        expect(screen.getAllByRole('button', { name: /Select visible/ })).toHaveLength(1);
        expect(screen.getAllByRole('button', { name: /Select all/ })).toHaveLength(1);
    });
});
