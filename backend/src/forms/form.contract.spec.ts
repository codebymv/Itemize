import {
  normalizeNotificationEmails,
  normalizeRedirectUrl,
  validateFormFields,
} from './form.contract';
import { FormFieldInput } from './form.inputs';

const field = (
  overrides: Partial<FormFieldInput> = {},
): FormFieldInput => ({
  id: 1,
  fieldType: 'text',
  label: 'Name',
  isRequired: true,
  validation: {},
  options: [],
  width: 'full',
  conditions: [],
  mapToContactField: 'first_name',
  ...overrides,
});
describe('authenticated form definition contract', () => {
  it('accepts bounded fields and a valid conditional graph', () => {
    expect(() =>
      validateFormFields([
        field({ id: 10 }),
        field({
          id: 20,
          label: 'Details',
          conditions: [
            {
              field_id: 10,
              operator: 'equals',
              value: 'yes',
              action: 'show',
            },
          ],
        }),
      ]),
    ).not.toThrow();
  });

  it.each([
    [
      field({ validation: { pattern: '(a+)+$' } }),
      'INVALID_FORM_CONFIGURATION',
    ],
    [
      field({ mapToContactField: 'organization_id' }),
      'INVALID_FORM_CONFIGURATION',
    ],
    [
      field({
        fieldType: 'select',
        options: [
          { label: 'A', value: 'same' },
          { label: 'B', value: 'same' },
        ],
      }),
      'INVALID_FORM_CONFIGURATION',
    ],
  ])('rejects unsafe field configuration', (invalidField, reason) => {
    try {
      validateFormFields([invalidField]);
      throw new Error('Expected validation failure');
    } catch (error) {
      expect((error as { extensions?: Record<string, unknown> }).extensions).toMatchObject({
        code: 'BAD_USER_INPUT',
        reason,
      });
    }
  });

  it('allows an empty draft field set only when explicitly requested', () => {
    expect(() => validateFormFields([], false)).not.toThrow();
    expect(() => validateFormFields([], true)).toThrow();
  });

  it('normalizes safe redirects and rejects credentials', () => {
    expect(normalizeRedirectUrl(' https://example.com/done ')).toBe(
      'https://example.com/done',
    );
    expect(() =>
      normalizeRedirectUrl('https://user:secret@example.com/done'),
    ).toThrow();
  });

  it('normalizes and deduplicates notification email identity', () => {
    expect(
      normalizeNotificationEmails([
        ' OWNER@example.com ',
        'owner@example.com',
      ]),
    ).toEqual(['owner@example.com']);
    expect(() => normalizeNotificationEmails(['invalid'])).toThrow();
  });
});
