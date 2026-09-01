import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PublicFormsController } from './public-forms.controller';
import { PublicFormFieldRow, PublicFormsRepository } from './public-forms.repository';
import { PublicFormsService } from './public-forms.service';

const FIELDS: PublicFormFieldRow[] = [
  {
    id: 1,
    field_type: 'text',
    label: 'Full name',
    is_required: true,
    validation: {},
    field_order: 0,
    conditions: [],
    map_to_contact_field: 'first_name',
  },
  {
    id: 2,
    field_type: 'email',
    label: 'Email',
    is_required: true,
    validation: {},
    field_order: 1,
    conditions: [],
    map_to_contact_field: 'email',
  },
  {
    id: 3,
    field_type: 'rating',
    label: 'Rating',
    is_required: false,
    validation: {},
    field_order: 2,
    conditions: [],
    map_to_contact_field: null,
  },
];

const FORM = {
  id: 5,
  name: 'Contact us',
  description: null,
  slug: 'contact-us',
  public_id: 'frm_abc123',
  type: 'contact',
  submit_button_text: 'Send',
  success_message: 'Thanks!',
  redirect_url: null,
  theme: {},
  organization_name: 'Acme',
};

describe('PublicFormsController retained HTTP contract', () => {
  let app: INestApplication;
  const repository = {
    publicForm: jest.fn(),
    submitPublicForm: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PublicFormsController],
      providers: [
        PublicFormsService,
        { provide: PublicFormsRepository, useValue: repository },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    repository.submitPublicForm.mockImplementation(
      async (
        _identifier: string,
        _context: unknown,
        validate: (fields: PublicFormFieldRow[]) => Record<string, unknown>,
      ) => {
        validate(FIELDS);
        return {
          status: 'ok',
          form: {
            ...FORM,
            organization_id: 3,
            notify_on_submit: false,
            notification_emails: null,
            create_contact: true,
            contact_tags: [],
          },
        };
      },
    );
  });

  it('serves the form definition in the success envelope with embed headers', async () => {
    repository.publicForm.mockResolvedValue({ form: FORM, fields: FIELDS });
    const response = await request(app.getHttpServer())
      .get('/api/forms/public/form/frm_abc123')
      .expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(response.body).toEqual({
      success: true,
      data: { ...FORM, fields: expect.any(Array) },
    });
    expect(response.body.data.fields).toHaveLength(3);
  });

  it('conceals unknown and ambiguous identifiers with the retained envelope', async () => {
    repository.publicForm.mockResolvedValue(null);
    const response = await request(app.getHttpServer())
      .get('/api/forms/public/form/unknown')
      .expect(404);
    expect(response.body).toEqual({
      success: false,
      error: { message: 'Form not found', code: 'NOT_FOUND' },
    });
  });

  it('fails closed when a stored definition violates the contract', async () => {
    repository.publicForm.mockResolvedValue({
      form: FORM,
      fields: [{ id: 1, field_type: 'hologram', label: 'Weird' }],
    });
    const response = await request(app.getHttpServer())
      .get('/api/forms/public/form/frm_abc123')
      .expect(400);
    expect(response.body).toEqual({
      success: false,
      error: {
        message: 'Weird has an unsupported type',
        code: 'INVALID_FORM_CONFIGURATION',
        details: { field_id: '1' },
      },
    });
  });

  it('submits normalized data and returns the retained double envelope', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/forms/public/form/frm_abc123')
      .set('Idempotency-Key', 'public-form-request-1')
      .send({
        data: { '1': '  Sam Doe  ', '2': 'SAM@Example.com', '3': 5 },
      })
      .expect(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      success: true,
      data: { success: true, message: 'Thanks!', redirect_url: null },
    });
    const validate = repository.submitPublicForm.mock.calls[0][2];
    expect(validate(FIELDS)).toEqual({
      '1': 'Sam Doe',
      '2': 'sam@example.com',
      '3': 5,
    });
    expect(repository.submitPublicForm.mock.calls[0][3]).toBe(
      'public-form-request-1',
    );
  });

  it('rejects unsafe idempotency keys before persistence', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/forms/public/form/frm_abc123')
      .set('Idempotency-Key', 'unsafe key')
      .send({ data: { '1': 'Sam', '2': 'sam@example.com' } })
      .expect(400);
    expect(response.body.error).toEqual({
      message: 'Idempotency key must be 1-128 safe ASCII characters',
      code: 'INVALID_IDEMPOTENCY_KEY',
    });
    expect(repository.submitPublicForm).not.toHaveBeenCalled();
  });

  it('reports reuse of a key with different submission data', async () => {
    repository.submitPublicForm.mockResolvedValue({
      status: 'idempotency_conflict',
    });
    const response = await request(app.getHttpServer())
      .post('/api/forms/public/form/frm_abc123')
      .set('Idempotency-Key', 'public-form-request-conflict')
      .send({ data: { '1': 'Sam', '2': 'sam@example.com' } })
      .expect(409);
    expect(response.body.error).toEqual({
      message: 'Idempotency key was already used for a different submission',
      code: 'IDEMPOTENCY_CONFLICT',
    });
  });

  it('reports missing required fields with field attribution', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/forms/public/form/frm_abc123')
      .send({ data: { '1': 'Sam' } })
      .expect(400);
    expect(response.body).toEqual({
      success: false,
      error: {
        message: 'Email is required',
        code: 'REQUIRED_FIELD',
        details: { field_id: '2' },
      },
    });
  });

  it('rejects unknown fields, invalid values, and oversized payloads', async () => {
    const unknown = await request(app.getHttpServer())
      .post('/api/forms/public/form/frm_abc123')
      .send({ data: { '1': 'Sam', '2': 'sam@example.com', '99': 'x' } })
      .expect(400);
    expect(unknown.body.error).toMatchObject({
      message: 'Form data contains an unknown field',
      code: 'INVALID_FORM_DATA',
      details: { field_id: '99' },
    });

    const invalidEmail = await request(app.getHttpServer())
      .post('/api/forms/public/form/frm_abc123')
      .send({ data: { '1': 'Sam', '2': 'not-an-email' } })
      .expect(400);
    expect(invalidEmail.body.error).toMatchObject({
      message: 'Email must be a valid email',
      details: { field_id: '2' },
    });

    const oversized = await request(app.getHttpServer())
      .post('/api/forms/public/form/frm_abc123')
      .send({ data: { '1': 'x'.repeat(70000), '2': 'sam@example.com' } })
      .expect(400);
    expect(oversized.body.error).toMatchObject({ code: 'FORM_DATA_TOO_LARGE' });
  });

  it('conceals a missing form on submission with the retained envelope', async () => {
    repository.submitPublicForm.mockResolvedValue({ status: 'not_found' });
    const response = await request(app.getHttpServer())
      .post('/api/forms/public/form/unknown')
      .send({ data: {} })
      .expect(404);
    expect(response.body).toEqual({
      success: false,
      error: { message: 'Form not found', code: 'NOT_FOUND' },
    });
  });

  it('maps read and write failures to the retained 500 envelopes', async () => {
    repository.publicForm.mockRejectedValue(new Error('boom'));
    const read = await request(app.getHttpServer())
      .get('/api/forms/public/form/frm_abc123')
      .expect(500);
    expect(read.body).toEqual({
      success: false,
      error: { message: 'Failed to load form', code: 'ERROR' },
    });

    repository.submitPublicForm.mockRejectedValue(new Error('boom'));
    const write = await request(app.getHttpServer())
      .post('/api/forms/public/form/frm_abc123')
      .send({ data: {} })
      .expect(500);
    expect(write.body).toEqual({
      success: false,
      error: { message: 'Failed to submit form', code: 'ERROR' },
    });
  });
});
