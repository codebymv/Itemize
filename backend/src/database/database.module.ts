import { Global, Inject, Injectable, Module, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';
import {
  booleanEnvironmentValue,
  integerEnvironmentValue,
  validateRuntimeEnvironment,
} from '../common/runtime-config';
import { RATE_LIMIT_BUCKET_STORE, createRateLimitBucketStore } from '../common/rate-limit-store';

export const PG_POOL = Symbol('PG_POOL');

const createPool = (): Pool => {
  validateRuntimeEnvironment();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required by the GraphQL service');
  }

  return new Pool({
    connectionString,
    ssl: booleanEnvironmentValue(process.env, 'DATABASE_SSL', true)
      ? { rejectUnauthorized: false }
      : false,
    max: integerEnvironmentValue(
      process.env,
      'DATABASE_POOL_MAX',
      10,
      1,
      100,
    ),
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
    query_timeout: 30_000,
  });
};

@Injectable()
class DatabaseLifecycle implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

@Global()
@Module({
  providers: [
    { provide: PG_POOL, useFactory: createPool },
    {
      provide: RATE_LIMIT_BUCKET_STORE,
      useFactory: (pool: Pool) => createRateLimitBucketStore(pool),
      inject: [PG_POOL],
    },
    DatabaseLifecycle,
  ],
  exports: [PG_POOL, RATE_LIMIT_BUCKET_STORE],
})
export class DatabaseModule {}
