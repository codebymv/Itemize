const stripeConnectService = require('../../services/stripeConnectService');

describe('stripeConnectService redirect URI', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalRedirect = process.env.STRIPE_CONNECT_REDIRECT_URI;

    afterEach(() => {
        process.env.NODE_ENV = originalEnv;
        if (originalRedirect === undefined) delete process.env.STRIPE_CONNECT_REDIRECT_URI;
        else process.env.STRIPE_CONNECT_REDIRECT_URI = originalRedirect;
    });

    it('defaults to the production API callback', () => {
        process.env.NODE_ENV = 'production';
        delete process.env.STRIPE_CONNECT_REDIRECT_URI;
        expect(stripeConnectService.getConnectRedirectUri()).toBe(
            'https://api.itemize.cloud/api/invoice-integrations/stripe/callback',
        );
    });

    it('defaults to localhost outside production', () => {
        process.env.NODE_ENV = 'test';
        delete process.env.STRIPE_CONNECT_REDIRECT_URI;
        expect(stripeConnectService.getConnectRedirectUri()).toBe(
            'http://localhost:3001/api/invoice-integrations/stripe/callback',
        );
    });
});
