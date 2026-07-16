import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { graphqlCorsOptions } from './common/cors';

export const configureApp = (app: INestApplication): void => {
  app.enableCors(graphqlCorsOptions());
  app.use(cookieParser());
  app.enableShutdownHooks();
};
