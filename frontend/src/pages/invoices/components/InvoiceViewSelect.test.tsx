import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InvoiceViewSelect } from './InvoiceViewSelect';

describe('InvoiceViewSelect', () => {
    it('uses the established select control for invoice datasets', () => {
        render(
            <InvoiceViewSelect
                value="recurring"
                onValueChange={vi.fn()}
            />,
        );

        expect(screen.getByRole('combobox', { name: 'Select invoice view' })).toHaveTextContent(
            'Recurring schedules',
        );
    });

    it('fills compact filter and mobile containers', () => {
        render(
            <InvoiceViewSelect
                value="invoices"
                onValueChange={vi.fn()}
                compact
            />,
        );

        expect(screen.getByRole('combobox', { name: 'Select invoice view' })).toHaveClass('w-full');
    });
});
