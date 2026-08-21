const stripeConnectService = require('../../services/stripeConnectService');

describe('stripeConnectService redirect URI', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalRedirect = process.env.STRIPE_CONNECT_REDIRECT_URI;
    const originalRailwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN;

    afterEach(() => {
        process.env.NODE_ENV = originalEnv;
        if (originalRedirect === undefined) delete process.env.STRIPE_CONNECT_REDIRECT_URI;
        else process.env.STRIPE_CONNECT_REDIRECT_URI = originalRedirect;
        if (originalRailwayDomain === undefined) delete process.env.RAILWAY_PUBLIC_DOMAIN;
        else process.env.RAILWAY_PUBLIC_DOMAIN = originalRailwayDomain;
    });

    it('defaults to the production API callback', () => {
        process.env.NODE_ENV = 'production';
        delete process.env.STRIPE_CONNECT_REDIRECT_URI;
        delete process.env.RAILWAY_PUBLIC_DOMAIN;
        expect(stripeConnectService.getConnectRedirectUri()).toBe(
            'https://itemize-backend-production-92ad.up.railway.app/api/invoice-integrations/stripe/callback',
        );
    });

    it('uses the Railway public domain for the production callback', () => {
        process.env.NODE_ENV = 'production';
        delete process.env.STRIPE_CONNECT_REDIRECT_URI;
        process.env.RAILWAY_PUBLIC_DOMAIN = 'itemize-api.example.railway.app';

        expect(stripeConnectService.getConnectRedirectUri()).toBe(
            'https://itemize-api.example.railway.app/api/invoice-integrations/stripe/callback',
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
