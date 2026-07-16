import { allowedCorsOrigins, isCorsOriginAllowed } from './cors';

describe('GraphQL CORS policy', () => {
  it('allows the configured frontend and explicit staging origins', () => {
    const environment = {
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://app.example.com/path',
      EXTRA_CORS_ORIGINS: 'https://staging.example.com, invalid-url',
    };

    expect([...allowedCorsOrigins(environment)]).toEqual(expect.arrayContaining([
      'https://app.example.com',
      'https://staging.example.com',
      'https://itemize.cloud',
    ]));
    expect(isCorsOriginAllowed('https://staging.example.com', environment)).toBe(true);
  });

  it('rejects unconfigured and lookalike credentialed origins', () => {
    const environment = {
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://itemize.cloud',
      EXTRA_CORS_ORIGINS: '',
    };

    expect(isCorsOriginAllowed('https://evil.example', environment)).toBe(false);
    expect(isCorsOriginAllowed('https://itemize.cloud.evil.example', environment)).toBe(false);
  });

  it('permits local Vite origins only outside production', () => {
    expect(isCorsOriginAllowed('http://localhost:5173', {
      NODE_ENV: 'development',
      FRONTEND_URL: undefined,
      EXTRA_CORS_ORIGINS: '',
    })).toBe(true);
    expect(isCorsOriginAllowed('http://localhost:5173', {
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://itemize.cloud',
      EXTRA_CORS_ORIGINS: '',
    })).toBe(false);
  });
});
