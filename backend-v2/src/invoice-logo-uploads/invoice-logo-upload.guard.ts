import {
  BadRequestException, CanActivate, ExecutionContext, ForbiddenException,
  Injectable, ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { Request } from 'express';
import { GraphQLError } from 'graphql';
import { AccessTokenService } from '../auth/access-token.service';
import { OrganizationContextService } from '../organizations/organization-context.service';
import { RequestContextService } from '../request-context/request-context.service';

@Injectable()
export class InvoiceLogoUploadGuard implements CanActivate {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly organizations: OrganizationContextService,
    private readonly requestContext: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.itemize_auth;
    if (typeof token !== 'string' || !token) {
      throw new UnauthorizedException({ error: 'Authentication required', code: 'UNAUTHENTICATED' });
    }
    try {
      const identity = await this.accessTokens.verify(token);
      const organization = await this.organizations.resolve(
        identity.userId, request.headers['x-organization-id'],
      );
      this.requestContext.setIdentity(identity);
      this.requestContext.setOrganization(organization);
    } catch (error) {
      this.rethrow(error);
    }
    const cookie = request.cookies?.['csrf-token'];
    const rawHeader = request.headers['x-csrf-token'];
    const header = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    if (typeof cookie !== 'string' || !cookie) {
      throw new ForbiddenException({
        error: 'CSRF cookie is required', code: 'FORBIDDEN', reason: 'CSRF_COOKIE_MISSING',
      });
    }
    if (typeof header !== 'string' || !header) {
      throw new ForbiddenException({
        error: 'CSRF token is required', code: 'FORBIDDEN', reason: 'CSRF_TOKEN_MISSING',
      });
    }
    const cookieBytes = Buffer.from(cookie);
    const headerBytes = Buffer.from(header);
    if (cookieBytes.length !== headerBytes.length || !timingSafeEqual(cookieBytes, headerBytes)) {
      throw new ForbiddenException({
        error: 'CSRF token mismatch', code: 'FORBIDDEN', reason: 'CSRF_TOKEN_MISMATCH',
      });
    }
    return true;
  }

  private rethrow(error: unknown): never {
    if (!(error instanceof GraphQLError)) {
      throw new ServiceUnavailableException({
        error: 'Invoice logo authentication is unavailable', code: 'SERVICE_UNAVAILABLE',
      });
    }
    const body = {
      error: error.message,
      code: String(error.extensions.code ?? 'SERVICE_UNAVAILABLE'),
      ...(error.extensions.reason ? { reason: String(error.extensions.reason) } : {}),
      ...(error.extensions.field ? { field: String(error.extensions.field) } : {}),
    };
    if (body.code === 'UNAUTHENTICATED') throw new UnauthorizedException(body);
    if (body.code === 'FORBIDDEN') throw new ForbiddenException(body);
    if (body.code === 'BAD_USER_INPUT' || body.code === 'ORGANIZATION_REQUIRED') {
      throw new BadRequestException(body);
    }
    throw new ServiceUnavailableException(body);
  }
}
