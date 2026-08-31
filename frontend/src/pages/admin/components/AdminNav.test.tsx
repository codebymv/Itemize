import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AdminNav, AdminShellNavigation } from './AdminNav';

describe('AdminNav', () => {
    it('uses the app sidebar icon hover and active colors', () => {
        render(
            <MemoryRouter initialEntries={['/admin/operations']}>
                <AdminNav />
            </MemoryRouter>,
        );

        const navigation = screen.getByRole('navigation', { name: 'Admin sections' });
        const communications = within(navigation).getByRole('button', { name: 'Communications' });
        const operations = within(navigation).getByRole('button', { name: 'Operations' });

        expect(communications).toHaveClass(
            'group/navigation-row',
            'interaction-navigation',
            'data-[active=true]:bg-sidebar-accent',
        );
        expect(communications.querySelector('svg')).toHaveClass(
            'navigation-row-icon',
            'text-gray-600',
            'dark:text-gray-400',
        );
        expect(operations).toHaveAttribute('aria-current', 'page');
        expect(operations.querySelector('svg')).toHaveClass('text-blue-600');
        expect(operations.querySelector('svg')).toHaveClass('navigation-row-icon');
    });

    it('moves the complete active section into the compact shell selector', () => {
        render(
            <MemoryRouter initialEntries={['/admin/operations']}>
                <AdminShellNavigation />
            </MemoryRouter>,
        );

        const selector = screen.getByRole('combobox', { name: 'Admin section' });
        expect(selector).toHaveTextContent('OPERATIONS');
        expect(selector.querySelector('[data-admin-section-icon="Operations"]')).not.toBeNull();
    });
});
