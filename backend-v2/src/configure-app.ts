import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { Request, Response } from 'express';
import { apiRateLimit } from './common/api-rate-limit';
import { corsOptionsDelegate } from './common/cors';

export const configureApp = (app: NestExpressApplication): void => {
  app.set('trust proxy', 1);
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
