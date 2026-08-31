/**
 * Forms API Service
 */
import api from '@/lib/api';
import type { JsonRecord } from '@/types';

const unwrapResponse = <T>(payload: unknown): T => {
    if (payload && typeof payload === 'object' && 'data' in payload) {
        return payload.data as T;
    }
    return payload as T;
};
import {
    Form,
    FormsResponse,
    FormField,
    FormSubmission,
    FormSubmissionsResponse,
} from '@/types';
import {
    createFormViaGraphql,
    deleteFormSubmissionViaGraphql,
    deleteFormViaGraphql,
    duplicateFormViaGraphql,
    getFormSubmissionsViaGraphql,
    getFormViaGraphql,
    getFormPageViaGraphql,
    getFormsViaGraphql,
    replaceFormFieldsViaGraphql,
    updateFormViaGraphql,
} from './formsGraphql';

// ======================
// Forms API
// ======================

export interface FormCreateData {
    name: string;
    description?: string | null;
    type?: 'form' | 'survey' | 'quiz';
    submit_button_text?: string;
    success_message?: string;
    redirect_url?: string | null;
    notify_on_submit?: boolean;
    notification_emails?: string[];
    theme?: { primaryColor: string };
    create_contact?: boolean;
    contact_tags?: string[];
    fields?: FormField[];
    organization_id?: number;
}

export const getForms = async (organizationId?: number, status?: string): Promise<FormsResponse> => {
    return getFormsViaGraphql(organizationId, status);
};

export const getFormPage = async (
    params: {
        status?: Form['status'] | 'all';
        search?: string;
        page?: number;
        limit?: number;
    } = {},
    organizationId?: number,
    signal?: AbortSignal,
) => getFormPageViaGraphql(params, organizationId, signal);

export const getForm = async (id: number, organizationId?: number): Promise<Form> => {
    return getFormViaGraphql(id, organizationId);
};

export const createForm = async (data: FormCreateData): Promise<Form> => {
    return createFormViaGraphql(data);
};

export const updateForm = async (
    id: number,
    data: Partial<FormCreateData> & { status?: string },
    organizationId?: number
): Promise<Form> => {
    return updateFormViaGraphql(id, data, organizationId);
};

export const deleteForm = async (id: number, organizationId?: number): Promise<void> => {
    return deleteFormViaGraphql(id, organizationId);
};

export const updateFormFields = async (
    id: number,
    fields: FormField[],
    organizationId?: number
): Promise<{ fields: FormField[] }> => {
    return replaceFormFieldsViaGraphql(id, fields, organizationId);
};

export const duplicateForm = async (id: number, organizationId?: number): Promise<Form> => {
    return duplicateFormViaGraphql(id, organizationId);
};

// ======================
// Submissions API
// ======================

export const getFormSubmissions = async (
    formId: number,
    params: { page?: number; limit?: number } = {},
    organizationId?: number
): Promise<FormSubmissionsResponse> => {
    return getFormSubmissionsViaGraphql(formId, params, organizationId);
};

export const deleteFormSubmission = async (
    formId: number,
    submissionId: number,
    organizationId?: number
): Promise<void> => {
    return deleteFormSubmissionViaGraphql(formId, submissionId, organizationId);
};

// ======================
// Public Form API
// ======================

export interface PublicFormData {
    id: number;
    name: string;
    description?: string | null;
    slug: string;
    public_id: string;
    type: string;
    submit_button_text: string;
    success_message: string;
    redirect_url?: string | null;
    theme: { primaryColor: string };
    organization_name: string;
    fields: FormField[];
}

export const getPublicForm = async (identifier: string): Promise<PublicFormData> => {
    const response = await api.get(`/api/forms/public/form/${identifier}`);
    return unwrapResponse<PublicFormData>(response.data);
};

export const submitPublicForm = async (
    identifier: string,
    data: JsonRecord
): Promise<{ success: boolean; message: string; redirect_url?: string }> => {
    const response = await api.post(`/api/forms/public/form/${identifier}`, { data });
    return unwrapResponse<{ success: boolean; message: string; redirect_url?: string }>(response.data);
};

export default {
    getForms,
    getForm,
    createForm,
    updateForm,
    deleteForm,
    updateFormFields,
    duplicateForm,
    getFormSubmissions,
    deleteFormSubmission,
    getPublicForm,
    submitPublicForm,
};
