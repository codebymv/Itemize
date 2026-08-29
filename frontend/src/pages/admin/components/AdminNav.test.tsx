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
            'hover:bg-sidebar-accent',
            'data-[active=true]:bg-sidebar-accent',
        );
        expect(communications.querySelector('svg')).toHaveClass(
            'text-gray-600',
            'dark:text-gray-400',
            'group-hover/navigation-row:text-blue-600',
            'transition-colors',
        );
        expect(operations).toHaveAttribute('aria-current', 'page');
        expect(operations.querySelector('svg')).toHaveClass('text-blue-600');
        expect(operations.querySelector('svg')).not.toHaveClass('group-hover/navigation-row:text-blue-600');
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
