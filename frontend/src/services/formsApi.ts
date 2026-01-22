/**
 * Forms API Service
 */
import api from '@/lib/api';
import {
    Form,
    FormsResponse,
    FormField,
    FormSubmission,
    FormSubmissionsResponse,
} from '@/types';

// ======================
// Forms API
// ======================

export interface FormCreateData {
    name: string;
    description?: string;
    type?: 'form' | 'survey' | 'quiz';
    submit_button_text?: string;
    success_message?: string;
    redirect_url?: string;
    notify_on_submit?: boolean;
    notification_emails?: string[];
    theme?: { primaryColor: string };
    create_contact?: boolean;
    contact_tags?: string[];
    fields?: FormField[];
    organization_id?: number;
}

export const getForms = async (organizationId?: number, status?: string): Promise<FormsResponse> => {
    const response = await api.get('/api/forms', {
        params: { status },
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
    });
    return response.data;
};

export const getForm = async (id: number, organizationId?: number): Promise<Form> => {
    const response = await api.get(`/api/forms/${id}`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
    });
    return response.data;
};

export const createForm = async (data: FormCreateData): Promise<Form> => {
    const response = await api.post('/api/forms', data, {
        headers: data.organization_id ? { 'x-organization-id': data.organization_id.toString() } : {},
    });
    return response.data;
};

export const updateForm = async (
    id: number,
    data: Partial<FormCreateData> & { status?: string },
    organizationId?: number
): Promise<Form> => {
    const response = await api.put(`/api/forms/${id}`, data, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
    });
    return response.data;
};

export const deleteForm = async (id: number, organizationId?: number): Promise<void> => {
    await api.delete(`/api/forms/${id}`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
    });
};

export const updateFormFields = async (
    id: number,
    fields: FormField[],
    organizationId?: number
): Promise<{ fields: FormField[] }> => {
    const response = await api.put(`/api/forms/${id}/fields`, { fields }, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
    });
    return response.data;
};

export const duplicateForm = async (id: number, organizationId?: number): Promise<Form> => {
    const response = await api.post(`/api/forms/${id}/duplicate`, {}, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
    });
    return response.data;
};

// ======================
// Submissions API
// ======================

export const getFormSubmissions = async (
    formId: number,
    params: { page?: number; limit?: number } = {},
    organizationId?: number
): Promise<FormSubmissionsResponse> => {
    const response = await api.get(`/api/forms/${formId}/submissions`, {
        params,
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
    });
    return response.data;
};

export const deleteFormSubmission = async (
    formId: number,
    submissionId: number,
    organizationId?: number
): Promise<void> => {
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
    description?: string;
    slug: string;
    type: string;
    submit_button_text: string;
    success_message: string;
    redirect_url?: string;
    theme: { primaryColor: string };
    organization_name: string;
    fields: FormField[];
}

export const getPublicForm = async (slug: string): Promise<PublicFormData> => {
    const response = await api.get(`/api/public/form/${slug}`);
    return response.data;
};

export const submitPublicForm = async (
    slug: string,
    data: Record<string, any>
): Promise<{ success: boolean; message: string; redirect_url?: string }> => {
    const response = await api.post(`/api/public/form/${slug}`, { data });
    return response.data;
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
