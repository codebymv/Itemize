import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AdminNav } from './AdminNav';

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

        expect(communications).toHaveClass('group/item');
        expect(communications.querySelector('svg')).toHaveClass(
            'text-gray-600',
            'dark:text-gray-400',
            'group-hover/item:text-blue-600',
            'transition-colors',
        );
        expect(operations.querySelector('svg')).toHaveClass('text-blue-600');
        expect(operations.querySelector('svg')).not.toHaveClass('group-hover/item:text-blue-600');
    });
});
