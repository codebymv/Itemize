import {
  allowedCorsOrigins,
  corsOptionsDelegate,
  isCorsOriginAllowed,
  publicReviewWidgetPath,
} from './cors';

/* eslint-disable @typescript-eslint/no-var-requires */
const legacyCors = require('../../../backend/src/config/cors-options');
/* eslint-enable @typescript-eslint/no-var-requires */

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

describe('public review widget CORS delegate (cross-runtime parity)', () => {
  const environment = {
    NODE_ENV: 'production',
    FRONTEND_URL: 'https://itemize.cloud',
    EXTRA_CORS_ORIGINS: '',
  };
  const widgetPath = `/api/reputation/public/widget/${'a'.repeat(32)}`;

  const resolve = (
    method: string,
    path: string,
  ): Promise<Record<string, unknown>> =>
    new Promise((resolvePromise, rejectPromise) => {
      corsOptionsDelegate(environment)(
        { method, path },
        (error, options) => {
          if (error) rejectPromise(error);
          else resolvePromise(options as Record<string, unknown>);
        },
      );
    });

  const resolveLegacy = (
    method: string,
    path: string,
  ): Promise<Record<string, unknown>> =>
    new Promise((resolvePromise, rejectPromise) => {
      legacyCors.createCorsOptionsDelegate(
        ['https://itemize.cloud'],
        'production',
      )(
        { method, path },
        (error: Error | null, options: Record<string, unknown>) => {
          if (error) rejectPromise(error);
          else resolvePromise(options);
        },
      );
    });

  it('matches the widget path exactly like the legacy origin', () => {
    const cases = [
      [widgetPath, true],
      [`/api/reputation/public/widget/${'A'.repeat(32)}`, true],
      [`/api/reputation/public/widget/${'a'.repeat(31)}`, false],
      [`/api/reputation/public/widget/${'a'.repeat(32)}/extra`, false],
      ['/api/reputation/public/widget/not-hex-token-here-not-hex-token', false],
    ] as const;
    for (const [path, expected] of cases) {
      expect(publicReviewWidgetPath.test(path)).toBe(expected);
      expect(legacyCors.publicReviewWidgetPath.test(path)).toBe(expected);
    }
  });

  it('serves the widget read credential-free to any origin, like legacy', async () => {
    const nest = await resolve('GET', widgetPath);
    const legacy = await resolveLegacy('GET', widgetPath);
    for (const options of [nest, legacy]) {
      expect(options.origin).toBe('*');
      expect(options.credentials).toBe(false);
      expect(options.methods).toEqual(['GET', 'OPTIONS']);
      expect(options.allowedHeaders).toEqual([
        'Accept',
        'Content-Type',
        'Origin',
        'X-Request-Id',
      ]);
      expect(options.exposedHeaders).toEqual(['X-Request-Id']);
    }
  });

  it('keeps every other request on the credentialed allowlist, like legacy', async () => {
    for (const [method, path] of [
      ['POST', '/graphql'],
      ['GET', '/api/reputation/public/widget/short'],
      // The legacy delegate keys the wildcard on GET only; preserve it.
      ['OPTIONS', widgetPath],
    ] as const) {
      const nest = await resolve(method, path);
      const legacy = await resolveLegacy(method, path);
      expect(nest.credentials).toBe(true);
      expect(legacy.credentials).toBe(true);
      expect(nest.origin).not.toBe('*');
      expect(legacy.origin).not.toBe('*');
    }
  });
});
