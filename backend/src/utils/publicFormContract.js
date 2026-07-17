const validator = require('validator');

const MAX_PUBLIC_FORM_BYTES = 64 * 1024;
const MAX_PUBLIC_FORM_FIELDS = 100;
const MAX_NOTIFICATION_EMAILS = 20;

const FIELD_TYPES = new Set([
    'text',
    'email',
    'phone',
    'textarea',
    'select',
    'radio',
    'checkbox',
    'date',
    'number',
    'rating',
    'nps',
]);

const CONTACT_FIELDS = new Set([
    'first_name',
    'last_name',
    'email',
    'phone',
    'company',
]);

const CONDITION_OPERATORS = new Set([
    'equals',
    'not_equals',
    'contains',
    'not_contains',
    'is_empty',
    'is_not_empty',
]);

const CONDITION_ACTIONS = new Set(['show', 'hide', 'require']);
const VALIDATION_RULES = new Set([
    'min',
    'max',
    'min_length',
    'minLength',
    'max_length',
    'maxLength',
    'pattern',
]);

class PublicFormValidationError extends Error {
    constructor(message, fieldId = null, code = 'INVALID_FORM_DATA') {
        super(message);
        this.name = 'PublicFormValidationError';
        this.code = code;
        this.fieldId = fieldId;
    }
}

function isPlainObject(value) {
    return value !== null
        && typeof value === 'object'
        && !Array.isArray(value)
        && Object.getPrototypeOf(value) === Object.prototype;
}

function isBlank(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim().length === 0;
    if (Array.isArray(value)) return value.length === 0;
    return value === false;
}

function ruleValue(validation, ...names) {
    for (const name of names) {
        if (validation[name] !== undefined) return validation[name];
    }
    return undefined;
}

function boundedRuleInteger(value, name, min, max) {
    if (value === undefined) return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        throw new PublicFormValidationError(
            `${name} must be an integer between ${min} and ${max}`,
            null,
            'INVALID_FORM_CONFIGURATION'
        );
    }
    return parsed;
}

function normalizedOptions(field) {
    if (!Array.isArray(field.options)) return [];
    return field.options.map(option => {
        if (typeof option === 'string') return option.trim();
        if (
            isPlainObject(option)
            && typeof option.label === 'string'
            && option.label.trim()
            && option.label.length <= 200
            && typeof option.value === 'string'
        ) {
            return option.value.trim();
        }
        throw new PublicFormValidationError(
            `${field.label || 'Field'} has an invalid option`,
            field.id,
            'INVALID_FORM_CONFIGURATION'
        );
    });
}

function validatePattern(pattern, field) {
    if (pattern === undefined) return null;
    if (
        typeof pattern !== 'string'
        || pattern.length === 0
        || pattern.length > 200
        || /[()|]/.test(pattern)
    ) {
        throw new PublicFormValidationError(
            `${field.label || 'Field'} has an unsafe validation pattern`,
            field.id,
            'INVALID_FORM_CONFIGURATION'
        );
    }
    try {
        return new RegExp(pattern);
    } catch {
        throw new PublicFormValidationError(
            `${field.label || 'Field'} has an invalid validation pattern`,
            field.id,
            'INVALID_FORM_CONFIGURATION'
        );
    }
}

function validateFormDefinition(fields) {
    if (!Array.isArray(fields) || fields.length === 0 || fields.length > MAX_PUBLIC_FORM_FIELDS) {
        throw new PublicFormValidationError(
            `Published forms must contain between 1 and ${MAX_PUBLIC_FORM_FIELDS} fields`,
            null,
            'INVALID_FORM_CONFIGURATION'
        );
    }

    const definedFieldIds = fields
        .filter(field => field.id !== undefined && field.id !== null)
        .map(field => String(field.id));
    const fieldIds = new Set(definedFieldIds);
    if (fieldIds.size !== definedFieldIds.length) {
        throw new PublicFormValidationError(
            'Form field IDs must be unique',
            null,
            'INVALID_FORM_CONFIGURATION'
        );
    }

    for (const field of fields) {
        if (!FIELD_TYPES.has(field.field_type)) {
            throw new PublicFormValidationError(
                `${field.label || 'Field'} has an unsupported type`,
                field.id,
                'INVALID_FORM_CONFIGURATION'
            );
        }
        if (typeof field.label !== 'string' || !field.label.trim() || field.label.length > 255) {
            throw new PublicFormValidationError(
                'Every form field needs a label no longer than 255 characters',
                field.id,
                'INVALID_FORM_CONFIGURATION'
            );
        }
        if (field.width !== undefined && !['full', 'half'].includes(field.width)) {
            throw new PublicFormValidationError(
                `${field.label} has an unsupported width`,
                field.id,
                'INVALID_FORM_CONFIGURATION'
            );
        }
        if (field.map_to_contact_field && !CONTACT_FIELDS.has(field.map_to_contact_field)) {
            throw new PublicFormValidationError(
                `${field.label} has an unsupported contact mapping`,
                field.id,
                'INVALID_FORM_CONFIGURATION'
            );
        }

        if (field.options !== undefined && !Array.isArray(field.options)) {
            throw new PublicFormValidationError(
                `${field.label} has invalid options`,
                field.id,
                'INVALID_FORM_CONFIGURATION'
            );
        }
        const options = normalizedOptions(field);
        if (['select', 'radio'].includes(field.field_type) && options.length === 0) {
            throw new PublicFormValidationError(
                `${field.label} requires at least one option`,
                field.id,
                'INVALID_FORM_CONFIGURATION'
            );
        }
        if (options.length > 100 || options.some(value => !value || value.length > 200)) {
            throw new PublicFormValidationError(
                `${field.label} has invalid options`,
                field.id,
                'INVALID_FORM_CONFIGURATION'
            );
        }
        if (new Set(options).size !== options.length) {
            throw new PublicFormValidationError(
                `${field.label} has duplicate option values`,
                field.id,
                'INVALID_FORM_CONFIGURATION'
            );
        }

        if (field.validation !== undefined && !isPlainObject(field.validation)) {
            throw new PublicFormValidationError(
                `${field.label} has invalid validation rules`,
                field.id,
                'INVALID_FORM_CONFIGURATION'
            );
        }
        const validation = field.validation || {};
        const unknownValidationRule = Object.keys(validation).find(
            rule => !VALIDATION_RULES.has(rule)
        );
        if (unknownValidationRule) {
            throw new PublicFormValidationError(
                `${field.label} has an unsupported validation rule`,
                field.id,
                'INVALID_FORM_CONFIGURATION'
            );
        }
        const minLength = boundedRuleInteger(
            ruleValue(validation, 'min_length', 'minLength'),
            'min length',
            0,
            5000
        );
        const maxLength = boundedRuleInteger(
            ruleValue(validation, 'max_length', 'maxLength'),
            'max length',
            1,
            5000
        );
        if (minLength !== null && maxLength !== null && minLength > maxLength) {
            throw new PublicFormValidationError(
                `${field.label} has a minimum length greater than its maximum`,
                field.id,
                'INVALID_FORM_CONFIGURATION'
            );
        }
        validatePattern(ruleValue(validation, 'pattern'), field);

        const conditions = field.conditions ?? [];
        if (!Array.isArray(conditions) || conditions.length > 20) {
            throw new PublicFormValidationError(
                `${field.label} has invalid conditions`,
                field.id,
                'INVALID_FORM_CONFIGURATION'
            );
        }
        for (const condition of conditions) {
            const sourceId = String(condition?.field_id ?? condition?.fieldId ?? '');
            const operator = condition?.operator;
            const action = condition?.action || 'show';
            if (
                !isPlainObject(condition)
                || !fieldIds.has(sourceId)
                || sourceId === String(field.id)
                || !CONDITION_OPERATORS.has(operator)
                || !CONDITION_ACTIONS.has(action)
            ) {
                throw new PublicFormValidationError(
                    `${field.label} has an invalid condition`,
                    field.id,
                    'INVALID_FORM_CONFIGURATION'
                );
            }
        }
    }

    return true;
}

function conditionMatches(condition, data) {
    const sourceId = String(condition.field_id ?? condition.fieldId);
    const actual = data[sourceId];
    const expected = condition.value;
    switch (condition.operator) {
        case 'equals':
            return Array.isArray(actual)
                ? actual.map(String).includes(String(expected))
                : String(actual ?? '') === String(expected ?? '');
        case 'not_equals':
            return !conditionMatches({ ...condition, operator: 'equals' }, data);
        case 'contains':
            return Array.isArray(actual)
                ? actual.map(String).includes(String(expected))
                : String(actual ?? '').includes(String(expected ?? ''));
        case 'not_contains':
            return !conditionMatches({ ...condition, operator: 'contains' }, data);
        case 'is_empty':
            return isBlank(actual);
        case 'is_not_empty':
            return !isBlank(actual);
        default:
            return false;
    }
}

function fieldState(field, data) {
    const conditions = field.conditions || [];
    const showConditions = conditions.filter(condition => (condition.action || 'show') === 'show');
    const hideConditions = conditions.filter(condition => condition.action === 'hide');
    const requireConditions = conditions.filter(condition => condition.action === 'require');
    const active = showConditions.every(condition => conditionMatches(condition, data))
        && !hideConditions.some(condition => conditionMatches(condition, data));
    const required = Boolean(field.is_required)
        || requireConditions.some(condition => conditionMatches(condition, data));
    return { active, required };
}

function normalizeString(value, field, defaultMax) {
    if (typeof value !== 'string') {
        throw new PublicFormValidationError(`${field.label} must be text`, field.id);
    }
    const normalized = value.trim();
    const validation = isPlainObject(field.validation) ? field.validation : {};
    const minLength = ruleValue(validation, 'min_length', 'minLength') ?? 0;
    const maxLength = ruleValue(validation, 'max_length', 'maxLength') ?? defaultMax;
    if (normalized.length < Number(minLength) || normalized.length > Number(maxLength)) {
        throw new PublicFormValidationError(
            `${field.label} must be between ${minLength} and ${maxLength} characters`,
            field.id
        );
    }
    const pattern = validatePattern(ruleValue(validation, 'pattern'), field);
    if (pattern && !pattern.test(normalized)) {
        throw new PublicFormValidationError(`${field.label} has an invalid format`, field.id);
    }
    return normalized;
}

function normalizeNumber(value, field, defaultMin, defaultMax) {
    if (typeof value !== 'number' && typeof value !== 'string') {
        throw new PublicFormValidationError(`${field.label} must be a number`, field.id);
    }
    if (typeof value === 'string' && !value.trim()) {
        throw new PublicFormValidationError(`${field.label} must be a number`, field.id);
    }
    const normalized = Number(value);
    if (!Number.isFinite(normalized)) {
        throw new PublicFormValidationError(`${field.label} must be a finite number`, field.id);
    }
    const validation = isPlainObject(field.validation) ? field.validation : {};
    const min = Number(ruleValue(validation, 'min') ?? defaultMin);
    const max = Number(ruleValue(validation, 'max') ?? defaultMax);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
        throw new PublicFormValidationError(
            `${field.label} has invalid numeric bounds`,
            field.id,
            'INVALID_FORM_CONFIGURATION'
        );
    }
    if (normalized < min || normalized > max) {
        throw new PublicFormValidationError(`${field.label} must be between ${min} and ${max}`, field.id);
    }
    return normalized;
}

function normalizeFieldValue(field, value) {
    if (value === null || value === undefined) return null;
    const options = normalizedOptions(field);

    switch (field.field_type) {
        case 'text':
            return normalizeString(value, field, 500);
        case 'textarea':
            return normalizeString(value, field, 5000);
        case 'email': {
            const email = normalizeString(value, field, 254).toLowerCase();
            if (!validator.isEmail(email, { allow_utf8_local_part: false })) {
                throw new PublicFormValidationError(`${field.label} must be a valid email`, field.id);
            }
            return email;
        }
        case 'phone': {
            const phone = normalizeString(value, field, 50);
            const digitCount = (phone.match(/\d/g) || []).length;
            if (digitCount < 7 || digitCount > 20 || !/^[+\d().\-\s]+$/.test(phone)) {
                throw new PublicFormValidationError(`${field.label} must be a valid phone number`, field.id);
            }
            return phone;
        }
        case 'date': {
            const date = normalizeString(value, field, 10);
            if (!validator.isISO8601(date, { strict: true, strictSeparator: true })) {
                throw new PublicFormValidationError(`${field.label} must be a valid date`, field.id);
            }
            return date;
        }
        case 'select':
        case 'radio': {
            const selected = normalizeString(value, field, 200);
            if (!options.includes(selected)) {
                throw new PublicFormValidationError(`${field.label} contains an unsupported option`, field.id);
            }
            return selected;
        }
        case 'checkbox':
            if (options.length === 0) {
                if (typeof value !== 'boolean') {
                    throw new PublicFormValidationError(`${field.label} must be true or false`, field.id);
                }
                return value;
            }
            if (!Array.isArray(value) || value.length > options.length) {
                throw new PublicFormValidationError(`${field.label} must contain valid options`, field.id);
            }
            {
                const selected = [...new Set(value.map(item => String(item).trim()))];
                if (selected.some(item => !options.includes(item))) {
                    throw new PublicFormValidationError(`${field.label} contains an unsupported option`, field.id);
                }
                return selected;
            }
        case 'number':
            return normalizeNumber(value, field, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
        case 'rating': {
            const rating = normalizeNumber(value, field, 1, 5);
            if (!Number.isInteger(rating)) {
                throw new PublicFormValidationError(`${field.label} must be a whole number`, field.id);
            }
            return rating;
        }
        case 'nps': {
            const nps = normalizeNumber(value, field, 0, 10);
            if (!Number.isInteger(nps)) {
                throw new PublicFormValidationError(`${field.label} must be a whole number`, field.id);
            }
            return nps;
        }
        default:
            throw new PublicFormValidationError(
                `${field.label} has an unsupported type`,
                field.id,
                'INVALID_FORM_CONFIGURATION'
            );
    }
}

function validatePublicFormSubmission(fields, data) {
    validateFormDefinition(fields);
    if (!isPlainObject(data)) {
        throw new PublicFormValidationError('Form data must be an object');
    }

    const byteLength = Buffer.byteLength(JSON.stringify({ data }), 'utf8');
    if (byteLength > MAX_PUBLIC_FORM_BYTES) {
        throw new PublicFormValidationError(
            `Form data exceeds the ${MAX_PUBLIC_FORM_BYTES}-byte limit`,
            null,
            'FORM_DATA_TOO_LARGE'
        );
    }

    const allowedIds = new Set(fields.map(field => String(field.id)));
    const submittedIds = Object.keys(data);
    if (submittedIds.length > MAX_PUBLIC_FORM_FIELDS) {
        throw new PublicFormValidationError('Form data contains too many fields');
    }
    const unknownId = submittedIds.find(id => !allowedIds.has(id));
    if (unknownId) {
        throw new PublicFormValidationError('Form data contains an unknown field', unknownId);
    }

    const normalizedData = {};
    for (const field of fields) {
        const fieldId = String(field.id);
        const state = fieldState(field, data);
        if (!state.active) continue;
        const value = data[fieldId];
        if (state.required && isBlank(value)) {
            throw new PublicFormValidationError(`${field.label} is required`, field.id, 'REQUIRED_FIELD');
        }
        if (isBlank(value)) continue;
        normalizedData[fieldId] = normalizeFieldValue(field, value);
    }
    return normalizedData;
}

function normalizePublicRedirectUrl(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const input = String(value).trim();
    if (input.length > 500 || !/^https?:\/\//i.test(input)) {
        throw new PublicFormValidationError(
            'Redirect URL must be an absolute HTTP(S) URL',
            null,
            'INVALID_REDIRECT_URL'
        );
    }
    let url;
    try {
        url = new URL(input);
    } catch {
        throw new PublicFormValidationError(
            'Redirect URL must be an absolute HTTP(S) URL',
            null,
            'INVALID_REDIRECT_URL'
        );
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        throw new PublicFormValidationError(
            'Redirect URL must be an absolute HTTP(S) URL without credentials',
            null,
            'INVALID_REDIRECT_URL'
        );
    }
    return url.toString();
}

function normalizeNotificationEmails(value) {
    if (value === null || value === undefined) return [];
    if (!Array.isArray(value) || value.length > MAX_NOTIFICATION_EMAILS) {
        throw new PublicFormValidationError(
            `Notification emails must be an array of at most ${MAX_NOTIFICATION_EMAILS} addresses`,
            null,
            'INVALID_NOTIFICATION_EMAILS'
        );
    }
    const emails = [...new Set(value.map(email => String(email).trim().toLowerCase()))];
    if (
        emails.some(email => (
            !email
            || email.length > 254
            || !validator.isEmail(email, { allow_utf8_local_part: false })
        ))
    ) {
        throw new PublicFormValidationError(
            'Notification emails contain an invalid address',
            null,
            'INVALID_NOTIFICATION_EMAILS'
        );
    }
    return emails;
}

module.exports = {
    MAX_PUBLIC_FORM_BYTES,
    MAX_PUBLIC_FORM_FIELDS,
    PublicFormValidationError,
    normalizeNotificationEmails,
    normalizePublicRedirectUrl,
    validateFormDefinition,
    validatePublicFormSubmission,
};
