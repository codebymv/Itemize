import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { Request, Response } from 'express';
import { graphqlCorsOptions } from './common/cors';

export const configureApp = (app: NestExpressApplication): void => {
  app.set('trust proxy', 1);
  app.useBodyParser('json', {
    limit: '1mb',
    verify: (request: Request, _response: Response, buffer: Buffer) => {
      (request as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
    },
  });
  app.useBodyParser('urlencoded', { extended: true, limit: '1mb' });
  app.enableCors(graphqlCorsOptions());
  app.use(cookieParser());
  app.enableShutdownHooks();
};
