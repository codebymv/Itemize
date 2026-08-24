import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

// Sentry error tracking, mirroring the legacy origin's init
// (backend/src/index.js): dsn-gated, environment-tagged, 10% traces.
if (process.env.SENTRY_DSN) {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const Sentry = require('@sentry/node');
  /* eslint-enable @typescript-eslint/no-var-requires */
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1,
    profilesSampleRate: 0.1,
  });
  Logger.log('Sentry error tracking initialized', 'Bootstrap');
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  configureApp(app);
  const port = Number(process.env.PORT ?? 3100);
  await app.listen(port);
}

void bootstrap().catch((error: unknown) => {
  Logger.error(
    error instanceof Error ? error.stack : String(error),
    undefined,
    'Bootstrap',
  );
  process.exitCode = 1;
});
