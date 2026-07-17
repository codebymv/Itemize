import type {
  Form,
  FormField,
  FormSubmission,
  FormSubmissionsResponse,
  FormsResponse,
  JsonRecord,
} from '@/types';
import type { FormCreateData } from './formsApi';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';

type GraphqlFormField = {
  id: number;
  formId: number;
  fieldType: FormField['field_type'];
  label: string;
  placeholder: string | null;
  helpText: string | null;
  isRequired: boolean;
  validation: JsonRecord;
  options: FormField['options'];
  fieldOrder: number;
  width: FormField['width'];
  conditions: JsonRecord[];
  mapToContactField: string | null;
};
type GraphqlForm = {
  id: number;
  organizationId: number;
  name: string;
  description: string | null;
  slug: string;
  publicId: string;
  type: Form['type'];
  status: Form['status'];
  submitButtonText: string;
  successMessage: string;
  redirectUrl: string | null;
  notifyOnSubmit: boolean;
  notificationEmails: string[];
  theme: Form['theme'];
  createContact: boolean;
  contactTags: string[];
  createdById: number | null;
  fields?: GraphqlFormField[];
  submissionCount: number;
  fieldCount: number;
  createdAt: string;
  updatedAt: string;
};

type GraphqlSubmission = {
  id: number;
  formId: number;
  organizationId: number;
  contactId: number | null;
  data: JsonRecord;
  ipAddress: string | null;
  userAgent: string | null;
  referrer: string | null;
  score: number | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
  createdAt: string;
};

const formFields = `
  id organizationId name description slug publicId type status
  submitButtonText successMessage redirectUrl notifyOnSubmit
  notificationEmails theme createContact contactTags createdById
  submissionCount fieldCount createdAt updatedAt
`;

const fieldFields = `
  id formId fieldType label placeholder helpText isRequired validation
  options fieldOrder width conditions mapToContactField
`;

const formsQuery = `
  query FormReads($status: String) {
    forms(status: $status) { ${formFields} }
  }
`;

const formQuery = `
  query FormRead($id: Int!) {
    form(id: $id) { ${formFields} fields { ${fieldFields} } }
  }
`;

const createFormMutation = `
  mutation CreateForm($input: CreateFormInput!) {
    createForm(input: $input) { ${formFields} fields { ${fieldFields} } }
  }
`;

const updateFormMutation = `
  mutation UpdateForm($id: Int!, $input: UpdateFormInput!) {
    updateForm(id: $id, input: $input) { ${formFields} fields { ${fieldFields} } }
  }
`;

const deleteFormMutation = `
  mutation DeleteForm($id: Int!) {
    deleteForm(id: $id) { deletedId }
  }
`;

const duplicateFormMutation = `
  mutation DuplicateForm($id: Int!) {
    duplicateForm(id: $id) { ${formFields} fields { ${fieldFields} } }
  }
`;

const replaceFieldsMutation = `
  mutation ReplaceFormFields($formId: Int!, $fields: [FormFieldInput!]!) {
    replaceFormFields(formId: $formId, fields: $fields) {
      fields { ${fieldFields} }
    }
  }
`;

const submissionsQuery = `
  query FormSubmissions($formId: Int!, $page: Int!, $limit: Int!) {
    formSubmissions(formId: $formId, page: $page, limit: $limit) {
      submissions {
        id formId organizationId contactId data ipAddress userAgent referrer
        score contactFirstName contactLastName contactEmail createdAt
      }
      page limit total totalPages
    }
  }
`;

const deleteSubmissionMutation = `
  mutation DeleteFormSubmission($formId: Int!, $submissionId: Int!) {
    deleteFormSubmission(formId: $formId, submissionId: $submissionId) {
      deletedId
    }
  }
`;

const mapField = (field: GraphqlFormField): FormField => ({
  id: field.id,
  form_id: field.formId,
  field_type: field.fieldType,
  label: field.label,
  ...(field.placeholder === null ? {} : { placeholder: field.placeholder }),
  ...(field.helpText === null ? {} : { help_text: field.helpText }),
  is_required: field.isRequired,
  validation: field.validation ?? {},
  options: field.options ?? [],
  field_order: field.fieldOrder,
  width: field.width,
  conditions: field.conditions ?? [],
  ...(field.mapToContactField === null
    ? {}
    : { map_to_contact_field: field.mapToContactField }),
});

const mapForm = (form: GraphqlForm): Form => ({
  id: form.id,
  organization_id: form.organizationId,
  name: form.name,
  ...(form.description === null ? {} : { description: form.description }),
  slug: form.slug,
  public_id: form.publicId,
  type: form.type,
  status: form.status,
  submit_button_text: form.submitButtonText,
  success_message: form.successMessage,
  ...(form.redirectUrl === null ? {} : { redirect_url: form.redirectUrl }),
  notify_on_submit: form.notifyOnSubmit,
  notification_emails: form.notificationEmails,
  theme: form.theme,
  create_contact: form.createContact,
  contact_tags: form.contactTags,
  ...(form.createdById === null ? {} : { created_by: form.createdById }),
  ...(form.fields ? { fields: form.fields.map(mapField) } : {}),
  submission_count: form.submissionCount,
  field_count: form.fieldCount,
  created_at: form.createdAt,
  updated_at: form.updatedAt,
});

const mapSubmission = (submission: GraphqlSubmission): FormSubmission => ({
  id: submission.id,
  form_id: submission.formId,
  organization_id: submission.organizationId,
  ...(submission.contactId === null ? {} : { contact_id: submission.contactId }),
  data: submission.data,
  ...(submission.ipAddress === null ? {} : { ip_address: submission.ipAddress }),
  ...(submission.userAgent === null ? {} : { user_agent: submission.userAgent }),
  ...(submission.referrer === null ? {} : { referrer: submission.referrer }),
  ...(submission.score === null ? {} : { score: submission.score }),
  ...(submission.contactFirstName === null
    ? {}
    : { contact_first_name: submission.contactFirstName }),
  ...(submission.contactLastName === null
    ? {}
    : { contact_last_name: submission.contactLastName }),
  ...(submission.contactEmail === null
    ? {}
    : { contact_email: submission.contactEmail }),
  created_at: submission.createdAt,
});

const has = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const mapFieldInput = (field: FormField) => ({
  ...(field.id === undefined ? {} : { id: field.id }),
  fieldType: field.field_type,
  label: field.label,
  ...(has(field, 'placeholder') ? { placeholder: field.placeholder ?? null } : {}),
  ...(has(field, 'help_text') ? { helpText: field.help_text ?? null } : {}),
  isRequired: field.is_required,
  validation: field.validation ?? {},
  options: field.options ?? [],
  width: field.width,
  conditions: field.conditions ?? [],
  ...(has(field, 'map_to_contact_field')
    ? { mapToContactField: field.map_to_contact_field ?? null }
    : {}),
});

const mapFormInput = (data: Partial<FormCreateData> & { status?: string }) => ({
  ...(has(data, 'name') && data.name !== undefined ? { name: data.name } : {}),
  ...(has(data, 'description')
    ? { description: data.description ?? null }
    : {}),
  ...(has(data, 'type') && data.type !== undefined ? { type: data.type } : {}),
  ...(has(data, 'status') && data.status !== undefined
    ? { status: data.status }
    : {}),
  ...(has(data, 'submit_button_text') && data.submit_button_text !== undefined
    ? { submitButtonText: data.submit_button_text }
    : {}),
  ...(has(data, 'success_message') && data.success_message !== undefined
    ? { successMessage: data.success_message }
    : {}),
  ...(has(data, 'redirect_url')
    ? { redirectUrl: data.redirect_url ?? null }
    : {}),
  ...(has(data, 'notify_on_submit') && data.notify_on_submit !== undefined
    ? { notifyOnSubmit: data.notify_on_submit }
    : {}),
  ...(has(data, 'notification_emails') && data.notification_emails !== undefined
    ? { notificationEmails: data.notification_emails }
    : {}),
  ...(has(data, 'theme') && data.theme !== undefined ? { theme: data.theme } : {}),
  ...(has(data, 'create_contact') && data.create_contact !== undefined
    ? { createContact: data.create_contact }
    : {}),
  ...(has(data, 'contact_tags') && data.contact_tags !== undefined
    ? { contactTags: data.contact_tags }
    : {}),
  ...(has(data, 'fields') && data.fields !== undefined
    ? { fields: data.fields.map(mapFieldInput) }
    : {}),
});

export const getFormsViaGraphql = async (
  organizationId?: number,
  status?: string,
): Promise<FormsResponse> => {
  const data = await graphqlRequest<
    { forms: GraphqlForm[] },
    { status?: string }
  >(formsQuery, status ? { status } : {}, organizationId);
  return { forms: data.forms.map(mapForm) };
};

export const getFormViaGraphql = async (
  id: number,
  organizationId?: number,
): Promise<Form> => {
  const data = await graphqlRequest<{ form: GraphqlForm }, { id: number }>(
    formQuery,
    { id },
    organizationId,
  );
  return mapForm(data.form);
};

export const createFormViaGraphql = async (
  data: FormCreateData,
): Promise<Form> => {
  const response = await graphqlMutationRequest<
    { createForm: GraphqlForm },
    { input: ReturnType<typeof mapFormInput> }
  >(createFormMutation, { input: mapFormInput(data) }, data.organization_id);
  return mapForm(response.createForm);
};

export const updateFormViaGraphql = async (
  id: number,
  data: Partial<FormCreateData> & { status?: string },
  organizationId?: number,
): Promise<Form> => {
  const response = await graphqlMutationRequest<
    { updateForm: GraphqlForm },
    { id: number; input: ReturnType<typeof mapFormInput> }
  >(updateFormMutation, { id, input: mapFormInput(data) }, organizationId);
  return mapForm(response.updateForm);
};

export const deleteFormViaGraphql = async (
  id: number,
  organizationId?: number,
): Promise<void> => {
  await graphqlMutationRequest<
    { deleteForm: { deletedId: number } },
    { id: number }
  >(deleteFormMutation, { id }, organizationId);
};

export const duplicateFormViaGraphql = async (
  id: number,
  organizationId?: number,
): Promise<Form> => {
  const response = await graphqlMutationRequest<
    { duplicateForm: GraphqlForm },
    { id: number }
  >(duplicateFormMutation, { id }, organizationId);
  return mapForm(response.duplicateForm);
};

export const replaceFormFieldsViaGraphql = async (
  id: number,
  fields: FormField[],
  organizationId?: number,
): Promise<{ fields: FormField[] }> => {
  const response = await graphqlMutationRequest<
    { replaceFormFields: { fields: GraphqlFormField[] } },
    { formId: number; fields: ReturnType<typeof mapFieldInput>[] }
  >(
    replaceFieldsMutation,
    { formId: id, fields: fields.map(mapFieldInput) },
    organizationId,
  );
  return { fields: response.replaceFormFields.fields.map(mapField) };
};

export const getFormSubmissionsViaGraphql = async (
  formId: number,
  params: { page?: number; limit?: number } = {},
  organizationId?: number,
): Promise<FormSubmissionsResponse> => {
  const page = params.page ?? 1;
  const limit = params.limit ?? 50;
  const response = await graphqlRequest<
    {
      formSubmissions: {
        submissions: GraphqlSubmission[];
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    },
    { formId: number; page: number; limit: number }
  >(submissionsQuery, { formId, page, limit }, organizationId);
  return {
    submissions: response.formSubmissions.submissions.map(mapSubmission),
    pagination: {
      page: response.formSubmissions.page,
      limit: response.formSubmissions.limit,
      total: response.formSubmissions.total,
      totalPages: response.formSubmissions.totalPages,
    },
  };
};

export const deleteFormSubmissionViaGraphql = async (
  formId: number,
  submissionId: number,
  organizationId?: number,
): Promise<void> => {
  await graphqlMutationRequest<
    { deleteFormSubmission: { deletedId: number } },
    { formId: number; submissionId: number }
  >(
    deleteSubmissionMutation,
    { formId, submissionId },
    organizationId,
  );
};
