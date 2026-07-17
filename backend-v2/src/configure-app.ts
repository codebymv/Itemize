import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { graphqlCorsOptions } from './common/cors';

export const configureApp = (app: NestExpressApplication): void => {
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '1mb' });
  app.enableCors(graphqlCorsOptions());
  app.use(cookieParser());
  app.enableShutdownHooks();
};
