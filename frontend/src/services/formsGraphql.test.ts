import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken } from '@/lib/api';
import {
  createFormViaGraphql,
  getFormSubmissionsViaGraphql,
  getFormViaGraphql,
  getFormsViaGraphql,
  replaceFormFieldsViaGraphql,
  updateFormViaGraphql,
} from './formsGraphql';
import {
  isFormGraphqlMutationsEnabled,
  isFormGraphqlReadsEnabled,
  isFormSubmissionGraphqlEnabled,
} from './graphqlClient';

vi.mock('@/lib/api', () => ({
  fetchCsrfToken: vi.fn(),
  getApiUrl: vi.fn(() => 'https://api.test.itemize'),
  refreshAuthenticatedSession: vi.fn(),
}));

const field = {
  id: 11,
  formId: 7,
  fieldType: 'email' as const,
  label: 'Email',
  placeholder: 'you@example.com',
  helpText: null,
  isRequired: true,
  validation: { maxLength: 254 },
  options: [],
  fieldOrder: 0,
  width: 'half' as const,
  conditions: [],
  mapToContactField: 'email',
};

const form = {
  id: 7,
  organizationId: 42,
  name: 'Registration',
  description: 'Join us',
  slug: 'registration-a1b2c3d4',
  publicId: 'frm_1234567890abcdef1234567890abcdef',
  type: 'form' as const,
  status: 'draft' as const,
  submitButtonText: 'Register',
  successMessage: 'Thanks',
  redirectUrl: null,
  notifyOnSubmit: true,
  notificationEmails: ['owner@example.com'],
  theme: { primaryColor: '#3B82F6' },
  createContact: true,
  contactTags: ['event'],
  createdById: 3,
  fields: [field],
  submissionCount: 1,
  fieldCount: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

const response = (payload: unknown): Response =>
  ({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(payload),
  }) as unknown as Response;

describe('forms GraphQL consumer', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(fetchCsrfToken).mockResolvedValue('forms-csrf');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('keeps all three authenticated rollback boundaries independent', () => {
    vi.stubEnv('VITE_FORM_READS_GRAPHQL', 'false');
    vi.stubEnv('VITE_FORM_MUTATIONS_GRAPHQL', 'false');
    vi.stubEnv('VITE_FORM_SUBMISSIONS_GRAPHQL', 'false');
    expect(isFormGraphqlReadsEnabled()).toBe(false);
    expect(isFormGraphqlMutationsEnabled()).toBe(false);
    expect(isFormSubmissionGraphqlEnabled()).toBe(false);

    vi.stubEnv('VITE_FORM_READS_GRAPHQL', 'true');
    vi.stubEnv('VITE_FORM_MUTATIONS_GRAPHQL', 'true');
    vi.stubEnv('VITE_FORM_SUBMISSIONS_GRAPHQL', 'true');
    expect(isFormGraphqlReadsEnabled()).toBe(true);
    expect(isFormGraphqlMutationsEnabled()).toBe(true);
    expect(isFormSubmissionGraphqlEnabled()).toBe(true);
  });

  it('maps form list and detail reads into the retained consumer shape', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ data: { forms: [{ ...form, fields: undefined }] } }))
      .mockResolvedValueOnce(response({ data: { form } }));

    await expect(getFormsViaGraphql(42, 'draft')).resolves.toEqual({
      forms: [
        expect.objectContaining({
          id: 7,
          organization_id: 42,
          public_id: form.publicId,
          submission_count: 1,
          field_count: 1,
        }),
      ],
    });
    await expect(getFormViaGraphql(7, 42)).resolves.toEqual(
      expect.objectContaining({
        id: 7,
        fields: [
          expect.objectContaining({
            id: 11,
            form_id: 7,
            field_type: 'email',
            is_required: true,
            field_order: 0,
            map_to_contact_field: 'email',
          }),
        ],
      }),
    );
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({
      credentials: 'include',
      headers: expect.objectContaining({ 'x-organization-id': '42' }),
    });
  });

  it('maps create/update inputs and preserves explicit nullable clearing', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ data: { createForm: form } }))
      .mockResolvedValueOnce(
        response({
          data: {
            updateForm: { ...form, description: null, redirectUrl: null },
          },
        }),
      );

    await createFormViaGraphql({
      name: 'Registration',
      submit_button_text: 'Register',
      notification_emails: ['owner@example.com'],
      fields: [
        {
          field_type: 'email',
          label: 'Email',
          is_required: true,
          field_order: 0,
          width: 'half',
          map_to_contact_field: 'email',
        },
      ],
      organization_id: 42,
    });
    await updateFormViaGraphql(
      7,
      { description: null, redirect_url: null },
      42,
    );

    const createBody = JSON.parse(
      String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body),
    );
    expect(createBody.variables.input).toMatchObject({
      name: 'Registration',
      submitButtonText: 'Register',
      notificationEmails: ['owner@example.com'],
      fields: [
        expect.objectContaining({
          fieldType: 'email',
          isRequired: true,
          mapToContactField: 'email',
        }),
      ],
    });
    const updateBody = JSON.parse(
      String((vi.mocked(fetch).mock.calls[1][1] as RequestInit).body),
    );
    expect(updateBody.variables).toEqual({
      id: 7,
      input: { description: null, redirectUrl: null },
    });
    expect(fetchCsrfToken).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({
      headers: expect.objectContaining({ 'x-csrf-token': 'forms-csrf' }),
    });
  });

  it('maps field replacement including conditional IDs', async () => {
    vi.mocked(fetch).mockResolvedValue(
      response({ data: { replaceFormFields: { fields: [field] } } }),
    );
    await replaceFormFieldsViaGraphql(
      7,
      [
        {
          id: 11,
          form_id: 7,
          field_type: 'email',
          label: 'Email',
          is_required: true,
          validation: {},
          options: [],
          field_order: 0,
          width: 'half',
          conditions: [
            { field_id: 10, operator: 'equals', value: 'yes', action: 'show' },
          ],
          map_to_contact_field: 'email',
        },
      ],
      42,
    );
    const body = JSON.parse(
      String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body),
    );
    expect(body.variables).toMatchObject({
      formId: 7,
      fields: [
        {
          id: 11,
          fieldType: 'email',
          conditions: [
            { field_id: 10, operator: 'equals', value: 'yes', action: 'show' },
          ],
        },
      ],
    });
  });

  it('maps paged submissions without exposing a new UI contract', async () => {
    vi.mocked(fetch).mockResolvedValue(
      response({
        data: {
          formSubmissions: {
            submissions: [
              {
                id: 90,
                formId: 7,
                organizationId: 42,
                contactId: null,
                data: { answer: 'yes' },
                ipAddress: null,
                userAgent: null,
                referrer: null,
                score: null,
                contactFirstName: null,
                contactLastName: null,
                contactEmail: null,
                createdAt: '2026-01-03T00:00:00.000Z',
              },
            ],
            page: 2,
            limit: 25,
            total: 26,
            totalPages: 2,
          },
        },
      }),
    );
    await expect(
      getFormSubmissionsViaGraphql(7, { page: 2, limit: 25 }, 42),
    ).resolves.toEqual({
      submissions: [
        {
          id: 90,
          form_id: 7,
          organization_id: 42,
          data: { answer: 'yes' },
          created_at: '2026-01-03T00:00:00.000Z',
        },
      ],
      pagination: { page: 2, limit: 25, total: 26, totalPages: 2 },
    });
  });
});
