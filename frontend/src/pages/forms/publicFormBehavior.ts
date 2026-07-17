import type { FormField, JsonRecord, JsonValue } from '@/types';

function isBlank(value: JsonValue | undefined): boolean {
    return value === null
        || value === undefined
        || value === ''
        || (Array.isArray(value) && value.length === 0);
}

function conditionMatches(condition: JsonRecord, values: JsonRecord): boolean {
    const sourceId = String(condition.field_id ?? condition.fieldId ?? '');
    const actual = values[sourceId];
    const expected = condition.value;

    switch (condition.operator) {
        case 'equals':
            return Array.isArray(actual)
                ? actual.map(String).includes(String(expected ?? ''))
                : String(actual ?? '') === String(expected ?? '');
        case 'not_equals':
            return !conditionMatches({ ...condition, operator: 'equals' }, values);
        case 'contains':
            return Array.isArray(actual)
                ? actual.map(String).includes(String(expected ?? ''))
                : String(actual ?? '').includes(String(expected ?? ''));
        case 'not_contains':
            return !conditionMatches({ ...condition, operator: 'contains' }, values);
        case 'is_empty':
            return isBlank(actual);
        case 'is_not_empty':
            return !isBlank(actual);
        default:
            return false;
    }
}

export function publicFormFieldState(field: FormField, values: JsonRecord) {
    const conditions = field.conditions || [];
    const showConditions = conditions.filter(condition => (condition.action || 'show') === 'show');
    const hideConditions = conditions.filter(condition => condition.action === 'hide');
    const requireConditions = conditions.filter(condition => condition.action === 'require');

    return {
        active: showConditions.every(condition => conditionMatches(condition, values))
            && !hideConditions.some(condition => conditionMatches(condition, values)),
        required: field.is_required
            || requireConditions.some(condition => conditionMatches(condition, values)),
    };
}

export function safePublicFormRedirect(value?: string): string | null {
    if (!value) return null;
    try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
            ? url.toString()
            : null;
    } catch {
        return null;
    }
}
