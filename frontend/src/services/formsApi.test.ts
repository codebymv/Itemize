import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import {
    createForm,
    deleteForm,
    deleteFormSubmission,
    duplicateForm,
    getForm,
    getForms,
    getFormSubmissions,
    getPublicForm,
    submitPublicForm,
    updateForm,
    updateFormFields,
} from './formsApi';
import {
    createFormViaGraphql,
    deleteFormSubmissionViaGraphql,
    deleteFormViaGraphql,
    duplicateFormViaGraphql,
    getFormSubmissionsViaGraphql,
    getFormViaGraphql,
    getFormsViaGraphql,
    replaceFormFieldsViaGraphql,
    updateFormViaGraphql,
} from './formsGraphql';

vi.mock('@/lib/api', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
    },
}));

vi.mock('./formsGraphql', () => ({
    createFormViaGraphql: vi.fn(),
    deleteFormSubmissionViaGraphql: vi.fn(),
    deleteFormViaGraphql: vi.fn(),
    duplicateFormViaGraphql: vi.fn(),
    getFormSubmissionsViaGraphql: vi.fn(),
    getFormViaGraphql: vi.fn(),
    getFormsViaGraphql: vi.fn(),
    replaceFormFieldsViaGraphql: vi.fn(),
    updateFormViaGraphql: vi.fn(),
}));

describe('forms transport boundary', () => {
    beforeEach(() => vi.clearAllMocks());

    it('routes the complete authenticated surface directly to GraphQL', async () => {
        await getForms(42, 'draft');
        await getForm(7, 42);
        await createForm({ name: 'Form', organization_id: 42 });
        await updateForm(7, { description: null }, 42);
        await deleteForm(7, 42);
        await updateFormFields(7, [], 42);
        await duplicateForm(7, 42);
        await getFormSubmissions(7, { page: 2, limit: 25 }, 42);
        await deleteFormSubmission(7, 9, 42);

        expect(getFormsViaGraphql).toHaveBeenCalledWith(42, 'draft');
        expect(getFormViaGraphql).toHaveBeenCalledWith(7, 42);
        expect(createFormViaGraphql).toHaveBeenCalledWith({
            name: 'Form',
            organization_id: 42,
        });
        expect(updateFormViaGraphql).toHaveBeenCalledWith(
            7,
            { description: null },
            42,
        );
        expect(deleteFormViaGraphql).toHaveBeenCalledWith(7, 42);
        expect(replaceFormFieldsViaGraphql).toHaveBeenCalledWith(7, [], 42);
        expect(duplicateFormViaGraphql).toHaveBeenCalledWith(7, 42);
        expect(getFormSubmissionsViaGraphql).toHaveBeenCalledWith(
            7,
            { page: 2, limit: 25 },
            42,
        );
        expect(deleteFormSubmissionViaGraphql).toHaveBeenCalledWith(7, 9, 42);
        expect(api.get).not.toHaveBeenCalled();
        expect(api.post).not.toHaveBeenCalled();
    });

    it('retains anonymous public retrieval and submission on HTTP', async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { data: { id: 7, public_id: 'frm_test' } },
        });
        vi.mocked(api.post).mockResolvedValue({
            data: { data: { success: true, message: 'Thanks' } },
        });

        await getPublicForm('frm_test');
        await submitPublicForm('frm_test', { answer: 'yes' }, 'submission-key');

        expect(api.get).toHaveBeenCalledWith(
            '/api/forms/public/form/frm_test',
        );
        expect(api.post).toHaveBeenCalledWith(
            '/api/forms/public/form/frm_test',
            { data: { answer: 'yes' } },
            {
                headers: { 'Idempotency-Key': 'submission-key' },
                retryOnNetworkError: true,
            },
        );
    });
});
