/**
 * NestJS-native equivalents of the legacy origin's /api/health and
 * /api/status process probes. These are deliberately NOT proxied: a
 * health endpoint must describe the process that serves it, so each
 * runtime answers for itself. The response structures mirror the
 * retained handlers so the status page and external monitors keep
 * working after a direct-origin cutover; process-specific values
 * (uptime, memory, route inventory) intentionally describe this
 * runtime.
 */
import { Controller, Get, Inject, Res } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Response } from 'express';
import { Pool } from 'pg';
import { Public } from '../common/metadata';
import { PG_POOL } from '../database/database.module';

const HEALTHCHECK_STARTUP_GRACE_MS = parseInt(
  process.env.HEALTHCHECK_STARTUP_GRACE_MS || '60000',
  10,
);
const startedAt = Date.now();

type ExpressLayer = {
  route?: { path?: string };
  name?: string;
  handle?: { stack?: ExpressLayer[] };
  regexp?: { source?: string };
};

const collectRoutes = (stack: ExpressLayer[], basePath = ''): string[] => {
  const routes: string[] = [];
  for (const layer of stack) {
    if (layer.route && layer.route.path) {
      const routePath = layer.route.path;
      if (
        routePath &&
        !routePath.includes('*') &&
        !routePath.includes('/status')
      ) {
        routes.push(basePath + routePath);
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      let mountPath = '';
      const regexSource = layer.regexp?.source;
      if (regexSource) {
        const match = regexSource.match(/^\^\\\/(.+?)(?:\\\?\\\$)?$/);
        if (match) mountPath = '/' + match[1].replace(/\\\//g, '/');
      }
      routes.push(...collectRoutes(layer.handle.stack, basePath + mountPath));
    }
  }
  return routes;
};

const configuredCheck = (configured: boolean) => ({
  ok: configured,
  message: configured ? 'Configured' : 'Not configured',
});

@Controller('api')
export class OperationalStatusController {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly adapterHost: HttpAdapterHost,
  ) {}

  @Public()
  @Get('health')
  async health(@Res() response: Response): Promise<void> {
    const inStartupGrace = Date.now() - startedAt < HEALTHCHECK_STARTUP_GRACE_MS;
    const checks = {
      database: { ok: false, message: 'Unknown', latency: 0 },
      apiRoutes: { ok: true, message: 'Registered' },
    };
    try {
      const dbStart = Date.now();
      const dbResult = await this.pool.query('SELECT 1');
      checks.database = {
        ok: dbResult.rows.length > 0,
        message: dbResult.rows.length > 0 ? 'Connected' : 'No rows returned',
        latency: Date.now() - dbStart,
      };
    } catch (error) {
      checks.database = {
        ok: false,
        message: (error as Error).message,
        latency: 0,
      };
    }

    const optionalChecks = {
      email: configuredCheck(Boolean(process.env.RESEND_API_KEY)),
      twilio: configuredCheck(Boolean(process.env.TWILIO_ACCOUNT_SID)),
      stripe: configuredCheck(Boolean(process.env.STRIPE_SECRET_KEY)),
      aws: configuredCheck(
        Boolean(
          process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY,
        ),
      ),
      google: configuredCheck(Boolean(process.env.GOOGLE_CLIENT_ID)),
      sentry: configuredCheck(Boolean(process.env.SENTRY_DSN)),
    };
    const optionalHealthy = Object.values(optionalChecks).every(
      (check) => check.ok,
    );

    let statusCode = 200;
    let status: string;
    let startup: string | undefined;
    if (!checks.database.ok) {
      if (inStartupGrace) {
        status = 'starting';
        startup = `Grace period ${HEALTHCHECK_STARTUP_GRACE_MS}ms`;
      } else {
        statusCode = 503;
        status = 'unhealthy';
      }
    } else {
      status = optionalHealthy ? 'healthy' : 'degraded';
    }

    response.status(statusCode).json({
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      checks: { ...checks, ...optionalChecks },
      startup,
    });
  }

  @Public()
  @Get('status')
  async status(@Res() response: Response): Promise<void> {
    try {
      const healthChecks = {
        express: true,
        cors: true,
        json_parser: true,
        database: false,
      };
      const services = {
        api: 'operational',
        database: 'checking...',
        auth: 'operational',
      };
      try {
        const client = await this.pool.connect();
        try {
          await client.query('SELECT 1');
        } finally {
          client.release();
        }
        services.database = 'operational';
        healthChecks.database = true;
      } catch {
        services.database = 'degraded';
      }

      const instance = this.adapterHost.httpAdapter?.getInstance?.() as
        | {
            _router?: { stack?: ExpressLayer[] };
            router?: { stack?: ExpressLayer[] };
          }
        | undefined;
      // Express 4 exposes the route table as _router; Express 5 as router.
      const routerStack =
        instance?._router?.stack ?? instance?.router?.stack ?? null;
      const allRoutes = routerStack ? collectRoutes(routerStack, '') : [];
      const apiRoutes = new Set(
        allRoutes
          .map((path) => (path.startsWith('/') ? path : `/${path}`))
          .filter(
            (path) =>
              path.startsWith('/api/') && path !== '/api/' && path !== '/api',
          ),
      );

      response.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        version: '0.8.2',
        server: {
          port: Number(process.env.PORT || 3100),
          memory: {
            used:
              Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
            total:
              Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB',
            external: '0 MB',
          },
          platform: process.platform,
          nodeVersion: process.version,
        },
        services,
        healthChecks,
        endpoints: {
          total: apiRoutes.size,
          available: Array.from(apiRoutes).sort().slice(0, 50),
        },
      });
    } catch (error) {
      response.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: (error as Error).message,
      });
    }
  }
}
