import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Request, Response } from 'express';
import { apiRateLimit } from './common/api-rate-limit';
import { corsOptionsDelegate } from './common/cors';

export const configureApp = (app: NestExpressApplication): void => {
  app.set('trust proxy', 1);
  app.use(helmet({
    // HTML/PDF endpoints own their content policies. Public widgets and OAuth
    // callbacks must remain usable across origins.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    strictTransportSecurity: process.env.NODE_ENV === 'production'
      ? { maxAge: 31_536_000, includeSubDomains: false }
      : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }));
  if (process.env.NODE_ENV !== 'test') {
    const limiter = apiRateLimit();
    app.use('/api', limiter);
    app.use('/graphql', limiter);
  }
  app.useBodyParser('json', {
    limit: '1mb',
    verify: (request: Request, _response: Response, buffer: Buffer) => {
      (request as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
    },
  });
  app.useBodyParser('urlencoded', { extended: true, limit: '1mb' });
  app.enableCors(corsOptionsDelegate());
  app.use(cookieParser());
  app.enableShutdownHooks();
};
