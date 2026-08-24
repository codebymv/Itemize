/**
 * Global API rate limit mirroring the legacy origin
 * (backend/src/index.js globalLimiter): the same express-rate-limit
 * middleware, window, ceiling, headers, Retry-After, and 429 body, so
 * the ingress keeps the protection it had before the origin flip.
 * Disabled under NODE_ENV=test — integration suites drive both
 * runtimes far past any per-IP ceiling, exactly like the legacy suites
 * that mount routers without the limiter.
 */
import rateLimit from 'express-rate-limit';
import { Request, RequestHandler, Response } from 'express';
import { integerEnvironmentValue } from './runtime-config';

const rateLimitHandler =
  (message: Record<string, unknown>, retryAfterSeconds = 60) =>
  (_request: Request, response: Response): void => {
    response.set('Retry-After', String(retryAfterSeconds));
    response.status(429).json(message);
  };

export const apiRateLimit = (
  environment: NodeJS.ProcessEnv = process.env,
): RequestHandler => {
  const windowMs = integerEnvironmentValue(
    environment,
    'API_RATE_LIMIT_WINDOW_MS',
    15 * 60 * 1000,
    1_000,
    86_400_000,
  );
  const max = integerEnvironmentValue(
    environment,
    'API_RATE_LIMIT_MAX',
    1000,
    1,
    1_000_000,
  );
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: { message: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED' },
    },
    handler: rateLimitHandler(
      {
        error: { message: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED' },
      },
      Math.ceil(windowMs / 1000),
    ),
  });
};
