import { itemizeGraphqlError } from '../common/graphql-error';
import { FormFieldInput } from './form.inputs';

const FIELD_TYPES = new Set([
  'text', 'email', 'phone', 'textarea', 'select', 'radio', 'checkbox',
  'date', 'number', 'rating', 'nps',
]);
const CONTACT_FIELDS = new Set([
  'first_name', 'last_name', 'email', 'phone', 'company',
]);
const CONDITION_OPERATORS = new Set([
  'equals', 'not_equals', 'contains', 'not_contains', 'is_empty', 'is_not_empty',
]);
const CONDITION_ACTIONS = new Set(['show', 'hide', 'require']);
const VALIDATION_RULES = new Set([
  'min', 'max', 'min_length', 'minLength', 'max_length', 'maxLength', 'pattern',
]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const invalid = (message: string, field = 'fields', reason = 'INVALID_FORM_CONFIGURATION'): never => {
  throw itemizeGraphqlError(message, 'BAD_USER_INPUT', { field, reason });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const ruleInteger = (
  value: unknown,
  name: string,
  min: number,
  max: number,
): number | null => {
  if (value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    invalid(`${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
};

const optionValues = (field: FormFieldInput): string[] => {
  if (field.options === undefined) return [];
  if (!Array.isArray(field.options)) invalid(`${field.label || 'Field'} has invalid options`);
  return field.options.map((option) => {
    if (typeof option === 'string') return option.trim();
    if (
      isRecord(option) &&
      typeof option.label === 'string' &&
      option.label.trim() &&
      option.label.length <= 200 &&
      typeof option.value === 'string'
    ) {
      return option.value.trim();
    }
    return invalid(`${field.label || 'Field'} has an invalid option`);
  });
};

export const validateFormFields = (
  fields: FormFieldInput[],
  requireFields = true,
): void => {
  if (
    !Array.isArray(fields) ||
    fields.length > 100 ||
    (requireFields && fields.length === 0)
  ) {
    invalid('Published forms must contain between 1 and 100 fields');
  }
  const ids = fields
    .filter((field) => field.id !== undefined)
    .map((field) => String(field.id));
  if (new Set(ids).size !== ids.length) invalid('Form field IDs must be unique');
  const idSet = new Set(ids);

  for (const field of fields) {
    if (!FIELD_TYPES.has(field.fieldType)) {
      invalid(`${field.label || 'Field'} has an unsupported type`);
    }
    const label = field.label?.trim();
    if (!label || label.length > 255) {
      invalid('Every form field needs a label no longer than 255 characters');
    }
    if (field.width !== undefined && !['full', 'half'].includes(field.width)) {
      invalid(`${label} has an unsupported width`);
    }
    if (field.mapToContactField && !CONTACT_FIELDS.has(field.mapToContactField)) {
      invalid(`${label} has an unsupported contact mapping`);
    }
    const options = optionValues(field);
    if (['select', 'radio'].includes(field.fieldType) && options.length === 0) {
      invalid(`${label} requires at least one option`);
    }
    if (
      options.length > 100 ||
      options.some((value) => !value || value.length > 200) ||
      new Set(options).size !== options.length
    ) {
      invalid(`${label} has invalid or duplicate options`);
    }
    const validation = field.validation ?? {};
    if (!isRecord(validation)) invalid(`${label} has invalid validation rules`);
    if (Object.keys(validation).some((rule) => !VALIDATION_RULES.has(rule))) {
      invalid(`${label} has an unsupported validation rule`);
    }
    const minLength = ruleInteger(
      validation.min_length ?? validation.minLength,
      'min length',
      0,
      5000,
    );
    const maxLength = ruleInteger(
      validation.max_length ?? validation.maxLength,
      'max length',
      1,
      5000,
    );
    if (minLength !== null && maxLength !== null && minLength > maxLength) {
      invalid(`${label} has a minimum length greater than its maximum`);
    }
    const pattern = validation.pattern;
    if (pattern !== undefined) {
      if (
        typeof pattern !== 'string' ||
        !pattern ||
        pattern.length > 200 ||
        /[()|]/.test(pattern)
      ) {
        invalid(`${label} has an unsafe validation pattern`);
      }
      try {
        new RegExp(pattern as string);
      } catch {
        invalid(`${label} has an invalid validation pattern`);
      }
    }
    const conditions = field.conditions ?? [];
    if (!Array.isArray(conditions) || conditions.length > 20) {
      invalid(`${label} has invalid conditions`);
    }
    for (const condition of conditions) {
      const sourceId = String(condition?.field_id ?? condition?.fieldId ?? '');
      const operator = condition?.operator;
      const action = condition?.action ?? 'show';
      if (
        !isRecord(condition) ||
        !idSet.has(sourceId) ||
        sourceId === String(field.id) ||
        typeof operator !== 'string' ||
        !CONDITION_OPERATORS.has(operator) ||
        typeof action !== 'string' ||
        !CONDITION_ACTIONS.has(action)
      ) {
        invalid(`${label} has an invalid condition`);
      }
    }
  }
};

export const normalizeRedirectUrl = (
  value: string | null | undefined,
): string | null => {
  if (value === null || value === undefined || !value.trim()) return null;
  const input = value.trim();
  if (input.length > 500 || !/^https?:\/\//i.test(input)) {
    return invalid('Redirect URL must be an absolute HTTP(S) URL', 'redirectUrl', 'INVALID_REDIRECT_URL');
  }
  try {
    const url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      return invalid('Redirect URL must be an absolute HTTP(S) URL without credentials', 'redirectUrl', 'INVALID_REDIRECT_URL');
    }
    return url.toString();
  } catch {
    return invalid('Redirect URL must be an absolute HTTP(S) URL', 'redirectUrl', 'INVALID_REDIRECT_URL');
  }
};

export const normalizeNotificationEmails = (
  value: string[] | null | undefined,
): string[] => {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) {
    invalid('Notification emails must be an array of at most 20 addresses', 'notificationEmails', 'INVALID_NOTIFICATION_EMAILS');
  }
  const emails = [...new Set(value.map((email) => String(email).trim().toLowerCase()))];
  if (emails.some((email) => !email || email.length > 254 || !EMAIL_PATTERN.test(email))) {
    invalid('Notification emails contain an invalid address', 'notificationEmails', 'INVALID_NOTIFICATION_EMAILS');
  }
  return emails;
};
