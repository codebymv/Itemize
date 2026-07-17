import { describe, expect, it } from 'vitest';
import { createContactFormSchema } from './formSchemas';

const validContact = {
  first_name: 'Ada',
  last_name: '',
  email: '',
  phone: '',
  company: '',
  job_title: '',
  status: 'active' as const,
  source: 'manual' as const,
};

describe('createContactFormSchema', () => {
  it('accepts and removes blank optional contact fields', () => {
    const result = createContactFormSchema.parse(validContact);

    expect(result).toMatchObject({ first_name: 'Ada' });
    expect(result.last_name).toBeUndefined();
    expect(result.email).toBeUndefined();
    expect(result.phone).toBeUndefined();
  });

  it('treats whitespace-only optional fields as blank', () => {
    const result = createContactFormSchema.parse({
      ...validContact,
      first_name: ' ',
      company: 'Analytical Engines',
      email: '  ',
      phone: '  ',
    });

    expect(result.first_name).toBeUndefined();
    expect(result.email).toBeUndefined();
    expect(result.phone).toBeUndefined();
  });

  it('does not treat whitespace-only fields as a contact identity', () => {
    const result = createContactFormSchema.safeParse({
      ...validContact,
      first_name: ' ',
      last_name: ' ',
      email: ' ',
      phone: ' ',
      company: ' ',
      job_title: ' ',
    });

    expect(result.success).toBe(false);
  });

  it('still rejects malformed non-empty optional fields', () => {
    expect(createContactFormSchema.safeParse({
      ...validContact,
      email: 'not-an-email',
    }).success).toBe(false);
    expect(createContactFormSchema.safeParse({
      ...validContact,
      phone: '123',
    }).success).toBe(false);
  });
});
