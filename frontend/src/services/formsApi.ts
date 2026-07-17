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
    isFormGraphqlMutationsEnabled,
    isFormGraphqlReadsEnabled,
    isFormSubmissionGraphqlEnabled,
} from './graphqlClient';
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
    if (isFormGraphqlReadsEnabled()) {
        return getFormsViaGraphql(organizationId, status);
    }
    const response = await api.get('/api/forms', {
        params: { status },
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
    });
    return unwrapResponse<FormsResponse>(response.data);
};

export const getForm = async (id: number, organizationId?: number): Promise<Form> => {
    if (isFormGraphqlReadsEnabled()) {
        return getFormViaGraphql(id, organizationId);
    }
    const response = await api.get(`/api/forms/${id}`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
    });
    return unwrapResponse<Form>(response.data);
};

export const createForm = async (data: FormCreateData): Promise<Form> => {
    if (isFormGraphqlMutationsEnabled()) {
        return createFormViaGraphql(data);
    }
    const response = await api.post('/api/forms', data, {
        headers: data.organization_id ? { 'x-organization-id': data.organization_id.toString() } : {},
    });
    return unwrapResponse<Form>(response.data);
};

export const updateForm = async (
    id: number,
    data: Partial<FormCreateData> & { status?: string },
    organizationId?: number
): Promise<Form> => {
    if (isFormGraphqlMutationsEnabled()) {
        return updateFormViaGraphql(id, data, organizationId);
    }
    const response = await api.put(`/api/forms/${id}`, data, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
    });
    return unwrapResponse<Form>(response.data);
};

export const deleteForm = async (id: number, organizationId?: number): Promise<void> => {
    if (isFormGraphqlMutationsEnabled()) {
        return deleteFormViaGraphql(id, organizationId);
    }
    await api.delete(`/api/forms/${id}`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
    });
};

export const updateFormFields = async (
    id: number,
    fields: FormField[],
    organizationId?: number
): Promise<{ fields: FormField[] }> => {
    if (isFormGraphqlMutationsEnabled()) {
        return replaceFormFieldsViaGraphql(id, fields, organizationId);
    }
    const response = await api.put(`/api/forms/${id}/fields`, { fields }, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
    });
    return unwrapResponse<{ fields: FormField[] }>(response.data);
};

export const duplicateForm = async (id: number, organizationId?: number): Promise<Form> => {
    if (isFormGraphqlMutationsEnabled()) {
        return duplicateFormViaGraphql(id, organizationId);
    }
    const response = await api.post(`/api/forms/${id}/duplicate`, {}, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
    });
    return unwrapResponse<Form>(response.data);
};

// ======================
// Submissions API
// ======================

export const getFormSubmissions = async (
    formId: number,
    params: { page?: number; limit?: number } = {},
    organizationId?: number
): Promise<FormSubmissionsResponse> => {
    if (isFormSubmissionGraphqlEnabled()) {
        return getFormSubmissionsViaGraphql(formId, params, organizationId);
    }
    const response = await api.get(`/api/forms/${formId}/submissions`, {
        params,
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
    });
    return unwrapResponse<FormSubmissionsResponse>(response.data);
};

export const deleteFormSubmission = async (
    formId: number,
    submissionId: number,
    organizationId?: number
): Promise<void> => {
    if (isFormSubmissionGraphqlEnabled()) {
        return deleteFormSubmissionViaGraphql(formId, submissionId, organizationId);
    }
    await api.delete(`/api/forms/${formId}/submissions/${submissionId}`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
    });
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
