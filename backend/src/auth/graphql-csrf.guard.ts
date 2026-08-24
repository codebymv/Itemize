import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { timingSafeEqual } from 'node:crypto';
import { Request } from 'express';
import { itemizeGraphqlError } from '../common/graphql-error';
import { CSRF_PROTECTED_KEY } from '../common/metadata';

const CSRF_COOKIE = 'csrf-token';
const CSRF_HEADER = 'x-csrf-token';

const matches = (cookie: string, header: string): boolean => {
  const cookieBytes = Buffer.from(cookie);
  const headerBytes = Buffer.from(header);
  return cookieBytes.length === headerBytes.length && timingSafeEqual(cookieBytes, headerBytes);
};

@Injectable()
export class GraphqlCsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType<string>() !== 'graphql') return true;

    const protectedMutation = this.reflector.getAllAndOverride<boolean>(
      CSRF_PROTECTED_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!protectedMutation) return true;

    const request = GqlExecutionContext.create(context).getContext<{
      req: Request;
    }>().req;
    const cookie = request.cookies?.[CSRF_COOKIE];
    const rawHeader = request.headers[CSRF_HEADER];
    const header = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    if (typeof cookie !== 'string' || cookie.length === 0) {
      throw itemizeGraphqlError('CSRF cookie is required', 'FORBIDDEN', {
        reason: 'CSRF_COOKIE_MISSING',
      });
    }
    if (typeof header !== 'string' || header.length === 0) {
      throw itemizeGraphqlError('CSRF token is required', 'FORBIDDEN', {
        reason: 'CSRF_TOKEN_MISSING',
      });
    }
    if (!matches(cookie, header)) {
      throw itemizeGraphqlError('CSRF token mismatch', 'FORBIDDEN', {
        reason: 'CSRF_TOKEN_MISMATCH',
      });
    }
    return true;
  }
}
