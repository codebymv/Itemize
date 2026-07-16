import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';

export const configureApp = (app: INestApplication): void => {
  app.use(cookieParser());
  app.enableShutdownHooks();
};
