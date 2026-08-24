import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { itemizeGraphqlError } from '../common/graphql-error';
import { PG_POOL } from '../database/database.module';
import { RequestContextService } from '../request-context/request-context.service';

@Injectable()
export class AdminAccessGuard implements CanActivate {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly requestContext: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType<string>() !== 'graphql') return true;
    const identity = this.requestContext.current().identity;
    if (!identity) throw itemizeGraphqlError('Authentication required', 'UNAUTHENTICATED');
    const result = await this.pool.query<{ role: string | null }>(
      'SELECT role FROM users WHERE id = $1', [identity.userId],
    );
    if (result.rows[0]?.role !== 'ADMIN') {
      throw itemizeGraphqlError('Administrator access required', 'FORBIDDEN');
    }
    return true;
  }
}
