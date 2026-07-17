import { describe, expect, it } from 'vitest';
import type { FormField } from '@/types';
import { publicFormFieldState, safePublicFormRedirect } from './publicFormBehavior';

const field = (conditions: FormField['conditions']): FormField => ({
    id: 2,
    field_type: 'text',
    label: 'Details',
    is_required: false,
    field_order: 2,
    width: 'full',
    conditions,
});

describe('public form browser behavior', () => {
    it('applies show, hide, and conditional-required rules like the server', () => {
        expect(publicFormFieldState(field([
            { field_id: 1, operator: 'equals', value: 'yes', action: 'show' },
        ]), { 1: 'no' })).toEqual({ active: false, required: false });

        expect(publicFormFieldState(field([
            { field_id: 1, operator: 'equals', value: 'yes', action: 'hide' },
        ]), { 1: 'yes' })).toEqual({ active: false, required: false });

        expect(publicFormFieldState(field([
            { field_id: 1, operator: 'contains', value: 'pro', action: 'require' },
        ]), { 1: ['starter', 'pro'] })).toEqual({ active: true, required: true });
    });

    it('supports empty-value conditions', () => {
        expect(publicFormFieldState(field([
            { field_id: 1, operator: 'is_empty', action: 'show' },
        ]), { 1: [] }).active).toBe(true);
        expect(publicFormFieldState(field([
            { field_id: 1, operator: 'is_not_empty', action: 'show' },
        ]), { 1: 'value' }).active).toBe(true);
    });

    it('allows only absolute credential-free HTTP(S) redirects', () => {
        expect(safePublicFormRedirect('https://example.com/thanks')).toBe(
            'https://example.com/thanks'
        );
        expect(safePublicFormRedirect('javascript:alert(1)')).toBeNull();
        expect(safePublicFormRedirect('//example.com/thanks')).toBeNull();
        expect(safePublicFormRedirect('https://user:pass@example.com/thanks')).toBeNull();
    });
});
