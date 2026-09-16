import { gleamOrganizationAllowed } from './gleam-rollout';
import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { createPublicKey } from 'node:crypto';
import { Pool } from 'pg';
import { Request } from 'express';
import { z } from 'zod';
import { PG_POOL } from '../database/database.module';
import { gleamError } from './gleam-errors';
import { gleamKeyFingerprint } from './gleam-fingerprint';

export const GLEAM_TOKEN_ISSUER = 'urn:gleam:client-work:v1';
export const GLEAM_TOKEN_AUDIENCE = 'urn:itemize:client-work:v1';
const SCOPE_KEY = 'itemize:gleamScope';
export type GleamScope = 'handoffs:write' | 'receipts:read' | 'connection:read' | 'task-status:read' | 'notifications:write';
export const GleamScopeRequired = (scope: GleamScope) => SetMetadata(SCOPE_KEY, scope);
const safeId = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const headerSchema = z.object({ alg: z.literal('RS256'), typ: z.literal('JWT'), kid: safeId }).strict();
const claimsSchema = z.object({
  iss: z.literal(GLEAM_TOKEN_ISSUER), aud: z.literal(GLEAM_TOKEN_AUDIENCE),
  sub: safeId, connectionId: z.string().uuid(), generation: z.number().int().positive().max(2147483647),
  scope: z.enum(['handoffs:write','receipts:read','connection:read','task-status:read','notifications:write']), jti: z.string().uuid(),
  iat: z.number().int().nonnegative(), exp: z.number().int().positive(),
  nbf: z.number().int().nonnegative().optional(),
}).strict();
export type GleamPrincipal = {
  connectionId: string; generation: number; sourceOrganizationId: string; organizationId: number;
  scope: GleamScope; expiresAt: number; keyId: string; keyFingerprint: string;
};
export type GleamRequest = Request & { gleam?: GleamPrincipal };
export type GleamConnection = {
  id: string; organization_id: number; source_organization_id: string; generation: number;
  state: string; key_id: string; public_key: string; source_approved_at: Date | null;
  target_approved_at: Date | null; target_approved_by: number | null;
  default_assignee_id: number | null; due_after_minutes: number;
};

@Injectable()
export class GleamIntegrationGuard implements CanActivate {
  private readonly jwt = new JwtService();
  constructor(@Inject(PG_POOL) private readonly pool: Pool, private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<GleamScope>(SCOPE_KEY, [context.getHandler(), context.getClass()]);
    if (!required) gleamError(403, 'SCOPE_FORBIDDEN');
    const request = context.switchToHttp().getRequest<GleamRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ') || authorization.length > 8192) gleamError(401, 'INVALID_CREDENTIAL');
    const token = authorization.slice(7);
    let header: z.infer<typeof headerSchema>;
    let claims: z.infer<typeof claimsSchema>;
    try {
      const parts = token.split('.');
      if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error();
      // Unverified claims are used only to locate the pinned key, never as authority.
      header = headerSchema.parse(JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')));
      claims = claimsSchema.parse(JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')));
    } catch { gleamError(401, 'INVALID_CREDENTIAL'); }
    const result = await this.pool.query<GleamConnection>('SELECT * FROM gleam_connections WHERE id=$1', [claims.connectionId]);
    const connection = result.rows[0];
    const allowedState = claims.scope === 'connection:read' ? ['pending','active'] : ['active'];
    if (!connection || !allowedState.includes(connection.state) || !connection.source_approved_at || (claims.scope !== 'connection:read' && !connection.target_approved_at)
      || connection.generation !== claims.generation || connection.source_organization_id !== claims.sub || connection.key_id !== header.kid) {
      gleamError(401, 'INVALID_CREDENTIAL');
    }
    try {
      const key = createPublicKey(connection.public_key);
      if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new Error();
      const verified = await this.jwt.verifyAsync(token, {
        publicKey: key.export({ type: 'spki', format: 'pem' }).toString(),
        algorithms: ['RS256'], issuer: GLEAM_TOKEN_ISSUER, audience: GLEAM_TOKEN_AUDIENCE,
      });
      claims = claimsSchema.parse(verified);
      const now = Math.floor(Date.now()/1000);
      if (claims.exp <= now || claims.iat > now + 30 || claims.exp <= claims.iat || claims.exp - claims.iat > 300) throw new Error();
    } catch { gleamError(401, 'INVALID_CREDENTIAL'); }
    if (claims.scope !== required) gleamError(403, 'SCOPE_FORBIDDEN');
    if (!gleamOrganizationAllowed(connection.organization_id)) gleamError(403, 'ROLLOUT_DISABLED');
    request.gleam = {
      connectionId: claims.connectionId, generation: claims.generation, sourceOrganizationId: claims.sub,
      organizationId: connection.organization_id,
      scope: claims.scope, expiresAt: claims.exp, keyId: header.kid,
      keyFingerprint: gleamKeyFingerprint(connection.public_key),
    };
    return true;
  }
}
