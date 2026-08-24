import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Pool } from 'pg';
import { Server } from 'socket.io';
import { AccessTokenService } from '../auth/access-token.service';
import { PG_POOL } from '../database/database.module';
import {
  initializeRealtimeHost,
  RealtimeBroadcast,
  RealtimeHost,
} from './realtime-host';
import {
  startRealtimeOutboxDelivery,
} from './realtime-outbox-delivery';

const parseCookies = (header: string | undefined): Record<string, string> => {
  if (typeof header !== 'string') return {};
  return header.split(';').reduce<Record<string, string>>((cookies, pair) => {
    const separator = pair.indexOf('=');
    if (separator < 1) return cookies;
    const key = pair.slice(0, separator).trim();
    const rawValue = pair.slice(separator + 1).trim();
    try {
      cookies[key] = decodeURIComponent(rawValue);
    } catch {
      cookies[key] = rawValue;
    }
    return cookies;
  }, {});
};

/**
 * Attaches the ported Socket.IO host and its outbox delivery worker to
 * this process. Default-off: the socket host and the worker are one
 * unit — the worker emits into this process's rooms, so it must only
 * run in the runtime that clients actually connect to. Enable
 * REALTIME_HOST_NESTJS_ENABLED only when this service is the socket
 * origin (at direct-origin cutover, or in tests).
 */
@Injectable()
export class RealtimeHostService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(RealtimeHostService.name);
  private io: Server | null = null;
  private host: RealtimeHost | null = null;
  private worker: { stop: () => void } | null = null;

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly adapterHost: HttpAdapterHost,
    private readonly accessTokens: AccessTokenService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.REALTIME_HOST_NESTJS_ENABLED !== 'true') return;
    const httpServer = this.adapterHost.httpAdapter?.getHttpServer?.();
    if (!httpServer) {
      this.logger.error('Realtime host enabled but no HTTP server is available');
      return;
    }

    this.io = new Server(httpServer, {
      cors: {
        origin: [
          process.env.FRONTEND_URL || 'http://localhost:5173',
          'https://itemize.cloud',
          'https://itemize.up.railway.app',
        ],
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });
    this.host = initializeRealtimeHost(this.io, this.pool, async (cookieHeader) => {
      const token = parseCookies(cookieHeader).itemize_auth;
      if (!token) return null;
      try {
        const identity = await this.accessTokens.verify(token);
        return identity.userId;
      } catch {
        return null;
      }
    });
    this.worker = startRealtimeOutboxDelivery(this.pool, this.host.broadcast);
    this.logger.log('Realtime host and outbox delivery worker started');
  }

  async onApplicationShutdown(): Promise<void> {
    this.worker?.stop();
    this.worker = null;
    if (this.io) {
      await this.io.close();
      this.io = null;
    }
    this.host = null;
  }

  broadcast(): RealtimeBroadcast | null {
    return this.host?.broadcast ?? null;
  }

  /**
   * Agent-room notification used by the retained public chat routes.
   * A no-op while this process is not the socket origin; the chat
   * widget flag is only enabled together with the host flag.
   */
  emitToOrgChat(
    organizationId: number,
    event: string,
    payload: Record<string, unknown>,
  ): void {
    this.io?.to(`org-chat-${organizationId}`).emit(event, payload);
  }

  viewers(): RealtimeHost['viewers'] | null {
    return this.host?.viewers ?? null;
  }
}
