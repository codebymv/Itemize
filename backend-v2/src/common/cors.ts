import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

type CorsEnvironment = {
  EXTRA_CORS_ORIGINS?: string;
  FRONTEND_URL?: string;
  NODE_ENV?: string;
};

const fixedProductionOrigins = [
  'https://itemize.cloud',
  'https://itemize.up.railway.app',
];

const normalizedOrigin = (value: string | undefined): string | null => {
  if (!value?.trim()) return null;
  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
};

export const allowedCorsOrigins = (
  environment: CorsEnvironment = process.env,
): ReadonlySet<string> => {
  const primary = normalizedOrigin(environment.FRONTEND_URL) ?? (
    environment.NODE_ENV === 'production'
      ? 'https://itemize.cloud'
      : 'http://localhost:5173'
  );
  const extras = (environment.EXTRA_CORS_ORIGINS ?? '')
    .split(',')
    .map(normalizedOrigin)
    .filter((origin): origin is string => origin !== null);
  const local = environment.NODE_ENV === 'production'
    ? []
    : ['http://localhost:5173', 'http://127.0.0.1:5173'];

  return new Set([primary, ...fixedProductionOrigins, ...extras, ...local]);
};

export const isCorsOriginAllowed = (
  origin: string | undefined,
  environment: CorsEnvironment = process.env,
): boolean => !origin || allowedCorsOrigins(environment).has(origin);

export const publicReviewWidgetPath =
  /^\/api\/reputation\/public\/widget\/[a-f0-9]{32}$/i;

/**
 * Request-aware CORS delegate mirroring the legacy origin's
 * backend/src/config/cors-options.js: the embeddable public review
 * widget read is served credential-free to any origin
 * (Access-Control-Allow-Origin: *), while every other path keeps the
 * credentialed allowlist. Required before this runtime serves browsers
 * directly — the widget embeds on arbitrary third-party sites.
 */
export const corsOptionsDelegate = (
  environment: CorsEnvironment = process.env,
): ((
  request: { method?: string; path?: string; url?: string },
  callback: (error: Error | null, options: CorsOptions) => void,
) => void) => {
  const authenticated = graphqlCorsOptions(environment);
  return (request, callback) => {
    const path = request.path ?? (request.url ?? '').split('?')[0];
    if (request.method === 'GET' && publicReviewWidgetPath.test(path)) {
      callback(null, {
        origin: '*',
        credentials: false,
        methods: ['GET', 'OPTIONS'],
        allowedHeaders: ['Accept', 'Content-Type', 'Origin', 'X-Request-Id'],
        exposedHeaders: ['X-Request-Id'],
      });
      return;
    }
    callback(null, authenticated);
  };
};

export const graphqlCorsOptions = (
  environment: CorsEnvironment = process.env,
): CorsOptions => ({
  origin: (origin, callback) => {
    if (isCorsOriginAllowed(origin, environment)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Accept',
    'Origin',
    'X-Organization-Id',
    'X-Request-Id',
    'X-CSRF-Token',
  ],
  exposedHeaders: ['X-Request-Id'],
});
