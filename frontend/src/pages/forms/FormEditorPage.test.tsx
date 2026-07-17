import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FormEditorPage from './FormEditorPage';

const apiMocks = vi.hoisted(() => ({
    deleteFormSubmission: vi.fn(),
    getForm: vi.fn(),
    getFormSubmissions: vi.fn(),
    updateForm: vi.fn(),
    updateFormFields: vi.fn(),
}));

const toastMock = vi.hoisted(() => vi.fn());

vi.mock('@/services/formsApi', () => apiMocks);
vi.mock('@/hooks/useOrganization', () => ({
    useOrganization: () => ({
        organizationId: 42,
        organization: { id: 42, name: 'Test organization' },
        isLoading: false,
        error: null,
        refresh: vi.fn(),
    }),
}));
vi.mock('@/hooks/use-toast', () => ({
    useToast: () => ({ toast: toastMock }),
}));
vi.mock('@/contexts/HeaderContext', () => ({
    useHeader: () => ({ setHeaderContent: vi.fn() }),
}));

const form = {
    id: 7,
    organization_id: 42,
    name: 'Registration',
    description: 'Join us',
    slug: 'registration-a1b2c3d4',
    public_id: 'frm_1234567890abcdef1234567890abcdef',
    type: 'form' as const,
    status: 'draft' as const,
    submit_button_text: 'Register',
    success_message: 'Thanks',
    notify_on_submit: false,
    notification_emails: [],
    theme: { primaryColor: '#3B82F6' },
    create_contact: true,
    contact_tags: ['event'],
    fields: [
        {
            id: 11,
            form_id: 7,
            field_type: 'email' as const,
            label: 'Email',
            placeholder: 'you@example.com',
            is_required: true,
            validation: {},
            options: [],
            field_order: 0,
            width: 'full' as const,
            conditions: [],
            map_to_contact_field: 'email',
        },
    ],
    field_count: 1,
    submission_count: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
};

const renderEditor = () => render(
    <MemoryRouter initialEntries={['/forms/7']}>
        <Routes>
            <Route path="/forms/:id" element={<FormEditorPage />} />
        </Routes>
    </MemoryRouter>,
);

describe('FormEditorPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        apiMocks.getForm.mockResolvedValue(form);
        apiMocks.updateForm.mockImplementation(async (_id, update) => ({
            ...form,
            ...update,
        }));
        apiMocks.updateFormFields.mockImplementation(async (_id, fields) => ({
            fields: fields.map((field: object, index: number) => ({
                ...field,
                id: index + 11,
                form_id: 7,
            })),
        }));
        apiMocks.getFormSubmissions.mockResolvedValue({
            submissions: [{
                id: 90,
                form_id: 7,
                organization_id: 42,
                data: { Email: 'ada@example.com' },
                contact_first_name: 'Ada',
                contact_last_name: 'Lovelace',
                contact_email: 'ada@example.com',
                created_at: '2026-01-03T00:00:00.000Z',
            }],
            pagination: {
                page: 1,
                limit: 25,
                total: 1,
                totalPages: 1,
            },
        });
        apiMocks.deleteFormSubmission.mockResolvedValue(undefined);
    });

    it('loads and saves form settings through the shared adapter', async () => {
        renderEditor();

        const name = await screen.findByLabelText('Name');
        fireEvent.change(name, { target: { value: 'Updated registration' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

        await waitFor(() => expect(apiMocks.updateForm).toHaveBeenCalledWith(
            7,
            expect.objectContaining({
                name: 'Updated registration',
                description: 'Join us',
                submit_button_text: 'Register',
                contact_tags: ['event'],
            }),
            42,
        ));
        expect(toastMock).toHaveBeenCalledWith({ title: 'Settings saved' });
    });

    it('edits, adds, and saves ordered fields through the replacement adapter', async () => {
        renderEditor();
        await screen.findByLabelText('Name');

        fireEvent.mouseDown(screen.getByRole('tab', { name: 'Fields' }), {
            button: 0,
            ctrlKey: false,
        });
        fireEvent.change(screen.getByLabelText('Label'), {
            target: { value: 'Work email' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save fields' }));

        await waitFor(() => expect(apiMocks.updateFormFields).toHaveBeenCalledWith(
            7,
            [
                expect.objectContaining({
                    id: 11,
                    label: 'Work email',
                    field_order: 0,
                    map_to_contact_field: 'email',
                }),
                expect.objectContaining({
                    label: 'Untitled field',
                    field_order: 1,
                    field_type: 'text',
                }),
            ],
            42,
        ));
        expect(toastMock).toHaveBeenCalledWith({ title: 'Fields saved' });
    });

    it('loads and deletes submissions through the independent submission adapter', async () => {
        renderEditor();
        await screen.findByLabelText('Name');

        fireEvent.mouseDown(screen.getByRole('tab', { name: 'Submissions (1)' }), {
            button: 0,
            ctrlKey: false,
        });
        expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

        const dialog = await screen.findByRole('alertdialog', { name: 'Delete submission?' });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

        await waitFor(() => expect(apiMocks.deleteFormSubmission).toHaveBeenCalledWith(
            7,
            90,
            42,
        ));
        expect(apiMocks.getFormSubmissions).toHaveBeenCalledWith(
            7,
            { page: 1, limit: 25 },
            42,
        );
    });
});
