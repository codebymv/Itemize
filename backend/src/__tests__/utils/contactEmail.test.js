const { normalizeContactEmail } = require('../../utils/contactEmail');

describe('contact email identity', () => {
    it.each([
        [null, null],
        [undefined, null],
        ['', null],
        ['   ', null],
        ['  Person+Tag@Example.COM  ', 'person+tag@example.com'],
    ])('normalizes %p to %p', (input, expected) => {
        expect(normalizeContactEmail(input)).toBe(expected);
    });
});
