const {
    csrfProtection,
    issueCsrfToken,
    CSRF_COOKIE_NAME,
    CSRF_HEADER_NAME,
} = require('../../middleware/csrf');

function mockResponse() {
    return {
        cookie: jest.fn().mockReturnThis(),
        setHeader: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
    };
}

describe('csrfProtection', () => {
    it('allows safe methods without a token', () => {
        const req = { method: 'GET', path: '/api/lists', cookies: {} };
        const res = mockResponse();
        const next = jest.fn();

        csrfProtection(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('allows unauthenticated public writes without a session cookie', () => {
        const req = { method: 'POST', path: '/api/public/sign/token', cookies: {}, headers: {}, body: {} };
        const res = mockResponse();
        const next = jest.fn();

        csrfProtection(req, res, next);

        expect(next).toHaveBeenCalled();
    });

    it('rejects authenticated writes without csrf token', () => {
        const req = {
            method: 'POST',
            path: '/api/lists',
            cookies: { itemize_auth: 'cookie' },
            headers: {},
            body: {},
        };
        const res = mockResponse();
        const next = jest.fn();

        csrfProtection(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json.mock.calls[0][0].error.code).toBe('CSRF_TOKEN_MISSING');
    });

    it('allows authenticated writes with matching csrf header and cookie', () => {
        const token = 'csrf-token';
        const req = {
            method: 'POST',
            path: '/api/lists',
            cookies: { itemize_auth: 'cookie', [CSRF_COOKIE_NAME]: token },
            headers: { [CSRF_HEADER_NAME]: token },
            body: {},
        };
        const res = mockResponse();
        const next = jest.fn();

        csrfProtection(req, res, next);

        expect(next).toHaveBeenCalled();
    });

    it('reuses an existing csrf cookie instead of invalidating other tabs', () => {
        const req = {
            cookies: { [CSRF_COOKIE_NAME]: 'shared-tab-token' },
        };
        const res = mockResponse();

        issueCsrfToken(req, res);

        expect(res.cookie).not.toHaveBeenCalled();
        expect(res.setHeader).toHaveBeenCalledWith(
            'X-CSRF-Token',
            'shared-tab-token',
        );
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            csrfToken: 'shared-tab-token',
        });
    });
});
