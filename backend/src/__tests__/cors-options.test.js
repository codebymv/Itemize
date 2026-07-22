const { createCorsOptionsDelegate, publicReviewWidgetPath } = require('../config/cors-options');

function optionsFor(delegate, method, path) {
    let result;
    delegate({ method, path }, (_error, options) => { result = options; });
    return result;
}

describe('CORS route boundaries', () => {
    const delegate = createCorsOptionsDelegate(['https://itemize.cloud'], 'production');

    test('permits only exact credential-free public review-widget reads from arbitrary origins', () => {
        const key = 'a'.repeat(32);
        expect(publicReviewWidgetPath.test(`/api/reputation/public/widget/${key}`)).toBe(true);
        expect(optionsFor(delegate, 'GET', `/api/reputation/public/widget/${key}`)).toMatchObject({
            origin: '*', credentials: false, methods: ['GET', 'OPTIONS']
        });
        expect(optionsFor(delegate, 'POST', `/api/reputation/public/widget/${key}`).credentials).toBe(true);
        expect(optionsFor(delegate, 'GET', '/api/reputation/public/widget/not-a-key').credentials).toBe(true);
    });

    test('retains the allowlist and credential policy for every other route', () => {
        const options = optionsFor(delegate, 'GET', '/api/reputation/widgets');
        expect(options.credentials).toBe(true);
        expect(options.origin('https://itemize.cloud', (error, allowed) => {
            expect(error).toBeNull();
            expect(allowed).toBe(true);
        })).toBeUndefined();
        options.origin('https://attacker.example', (error) => {
            expect(error).toEqual(new Error('Not allowed by CORS'));
        });
    });
});
