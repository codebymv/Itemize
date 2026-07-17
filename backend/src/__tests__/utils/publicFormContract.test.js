const {
    MAX_PUBLIC_FORM_BYTES,
    PublicFormValidationError,
    normalizeNotificationEmails,
    normalizePublicRedirectUrl,
    validateFormDefinition,
    validatePublicFormSubmission,
} = require('../../utils/publicFormContract');

const fields = [
    {
        id: 1,
        field_type: 'email',
        label: 'Email',
        is_required: true,
        validation: {},
        options: [],
        conditions: [],
        map_to_contact_field: 'email',
    },
    {
        id: 2,
        field_type: 'select',
        label: 'Plan',
        is_required: true,
        validation: {},
        options: [
            { label: 'Starter', value: 'starter' },
            { label: 'Pro', value: 'pro' },
        ],
        conditions: [],
    },
    {
        id: 3,
        field_type: 'number',
        label: 'Seats',
        is_required: false,
        validation: { min: 1, max: 20 },
        options: [],
        conditions: [
            { field_id: 2, operator: 'equals', value: 'pro', action: 'require' },
        ],
    },
];

describe('public form contract', () => {
    test('normalizes typed values and enforces conditional requirements', () => {
        expect(validatePublicFormSubmission(fields, {
            1: '  Ada@Example.COM ',
            2: 'pro',
            3: '4',
        })).toEqual({
            1: 'ada@example.com',
            2: 'pro',
            3: 4,
        });

        expect(() => validatePublicFormSubmission(fields, {
            1: 'ada@example.com',
            2: 'pro',
        })).toThrow('Seats is required');
    });

    test('rejects unknown fields, invalid options, invalid email, and numeric bounds', () => {
        expect(() => validatePublicFormSubmission(fields, {
            1: 'ada@example.com',
            2: 'starter',
            99: 'smuggled',
        })).toThrow('unknown field');
        expect(() => validatePublicFormSubmission(fields, {
            1: 'ada@example.com',
            2: 'enterprise',
        })).toThrow('unsupported option');
        expect(() => validatePublicFormSubmission(fields, {
            1: 'not-an-email',
            2: 'starter',
        })).toThrow('valid email');
        expect(() => validatePublicFormSubmission(fields, {
            1: 'ada@example.com',
            2: 'starter',
            3: 100,
        })).toThrow('between 1 and 20');
    });

    test('enforces the domain payload limit', () => {
        const oversized = {
            1: 'ada@example.com',
            2: 'starter',
            3: 2,
            extra: 'x'.repeat(MAX_PUBLIC_FORM_BYTES),
        };
        let error;
        try {
            validatePublicFormSubmission(fields, oversized);
        } catch (caught) {
            error = caught;
        }
        expect(error).toMatchObject({ code: 'FORM_DATA_TOO_LARGE' });
    });

    test('fails closed on unsafe definitions', () => {
        expect(() => validateFormDefinition([{
            ...fields[0],
            field_type: 'html',
        }])).toThrow('unsupported type');
        expect(() => validateFormDefinition([{
            ...fields[0],
            validation: { pattern: '^(a+)+$' },
        }])).toThrow('unsafe validation pattern');
        expect(() => validateFormDefinition([{
            ...fields[0],
            map_to_contact_field: 'organization_id',
        }])).toThrow('unsupported contact mapping');
        expect(() => validateFormDefinition([{
            ...fields[0],
            width: 'quarter',
        }])).toThrow('unsupported width');
        expect(() => validateFormDefinition([{
            ...fields[0],
            validation: { arbitrary: true },
        }])).toThrow('unsupported validation rule');
        expect(() => validateFormDefinition([{
            ...fields[1],
            options: [{ value: 'starter' }],
        }])).toThrow('invalid option');
    });

    test('allows only absolute HTTP(S) redirects without credentials', () => {
        expect(normalizePublicRedirectUrl(' https://example.com/thanks ')).toBe(
            'https://example.com/thanks'
        );
        expect(normalizePublicRedirectUrl('')).toBeNull();
        for (const value of [
            'javascript:alert(1)',
            '//example.com/thanks',
            'https://user:password@example.com/thanks',
        ]) {
            expect(() => normalizePublicRedirectUrl(value)).toThrow(PublicFormValidationError);
        }
    });

    test('canonicalizes, deduplicates, and bounds notification addresses', () => {
        expect(normalizeNotificationEmails([
            ' Ops@Example.com ',
            'ops@example.com',
            'owner@example.com',
        ])).toEqual(['ops@example.com', 'owner@example.com']);
        expect(() => normalizeNotificationEmails(['invalid'])).toThrow('invalid address');
        expect(() => normalizeNotificationEmails(
            Array.from({ length: 21 }, (_, index) => `person${index}@example.com`)
        )).toThrow('at most 20');
    });
});
