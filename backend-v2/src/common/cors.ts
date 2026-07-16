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
  ],
  exposedHeaders: ['X-Request-Id'],
});
