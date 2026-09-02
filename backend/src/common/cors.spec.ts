import {
  allowedCorsOrigins,
  corsOptionsDelegate,
  isCorsOriginAllowed,
  publicChatWidgetPath,
  publicReviewWidgetPath,
} from './cors';


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

describe('public review widget CORS delegate (legacy-origin behavior pinned)', () => {
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
    }
  });

  it('serves the widget read credential-free to any origin', async () => {
    const options = await resolve('GET', widgetPath);
    {
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

  it('keeps every other request on the credentialed allowlist', async () => {
    for (const [method, path] of [
      ['POST', '/graphql'],
      ['GET', '/api/reputation/public/widget/short'],
      // The legacy delegate keys the wildcard on GET only; preserve it.
      ['OPTIONS', widgetPath],
    ] as const) {
      const options = await resolve(method, path);
      expect(options.credentials).toBe(true);
      expect(options.origin).not.toBe('*');
      expect(options.allowedHeaders).toEqual(
        expect.arrayContaining(['Idempotency-Key']),
      );
    }
  });
});

describe('public chat widget CORS delegate', () => {
  const environment = {
    NODE_ENV: 'production',
    FRONTEND_URL: 'https://itemize.cloud',
    EXTRA_CORS_ORIGINS: '',
  };
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

  it('matches only the public chat capability surface', () => {
    for (const path of [
      '/api/chat-widget/public/config/cw_public',
      '/api/chat-widget/public/session',
      `/api/chat-widget/public/messages/cs_${'a'.repeat(48)}`,
      '/api/chat-widget/public/messages',
      '/api/chat-widget/public/end-session',
      '/api/chat-widget/public/typing',
    ]) {
      expect(publicChatWidgetPath.test(path)).toBe(true);
    }
    expect(publicChatWidgetPath.test('/api/chat-widget/config')).toBe(false);
    expect(publicChatWidgetPath.test('/api/chat-widget/public/admin')).toBe(false);
  });

  it('allows credential-free embeds and their replay key preflight', async () => {
    for (const method of ['GET', 'POST', 'OPTIONS']) {
      const options = await resolve(method, '/api/chat-widget/public/messages');
      expect(options.origin).toBe('*');
      expect(options.credentials).toBe(false);
      expect(options.methods).toEqual(['GET', 'POST', 'OPTIONS']);
      expect(options.allowedHeaders).toEqual(expect.arrayContaining([
        'Content-Type',
        'Idempotency-Key',
      ]));
    }
  });
});
