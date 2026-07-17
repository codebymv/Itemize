import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { Request } from 'express';
import { GraphQLError } from 'graphql';
import { AccessTokenService } from '../auth/access-token.service';
import { OrganizationContextService } from '../organizations/organization-context.service';
import { RequestContextService } from '../request-context/request-context.service';

const matches = (cookie: string, header: string): boolean => {
  const cookieBytes = Buffer.from(cookie);
  const headerBytes = Buffer.from(header);
  return (
    cookieBytes.length === headerBytes.length &&
    timingSafeEqual(cookieBytes, headerBytes)
  );
};

@Injectable()
export class ContactTransferGuard implements CanActivate {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly organizations: OrganizationContextService,
    private readonly requestContext: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.itemize_auth;
    if (typeof token !== 'string' || token.length === 0) {
      throw new UnauthorizedException({
        error: 'Authentication required',
        code: 'UNAUTHENTICATED',
      });
    }

    try {
      const identity = await this.accessTokens.verify(token);
      const organization = await this.organizations.resolve(
        identity.userId,
        request.headers['x-organization-id'],
      );
      this.requestContext.setIdentity(identity);
      this.requestContext.setOrganization(organization);
    } catch (error) {
      this.rethrowHttp(error);
    }

    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) {
      this.verifyCsrf(request);
    }
    return true;
  }

  private verifyCsrf(request: Request): void {
    const cookie = request.cookies?.['csrf-token'];
    const rawHeader = request.headers['x-csrf-token'];
    const header = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    if (typeof cookie !== 'string' || cookie.length === 0) {
      throw new ForbiddenException({
        error: 'CSRF cookie is required',
        code: 'FORBIDDEN',
        reason: 'CSRF_COOKIE_MISSING',
      });
    }
    if (typeof header !== 'string' || header.length === 0) {
      throw new ForbiddenException({
        error: 'CSRF token is required',
        code: 'FORBIDDEN',
        reason: 'CSRF_TOKEN_MISSING',
      });
    }
    if (!matches(cookie, header)) {
      throw new ForbiddenException({
        error: 'CSRF token mismatch',
        code: 'FORBIDDEN',
        reason: 'CSRF_TOKEN_MISMATCH',
      });
    }
  }

  private rethrowHttp(error: unknown): never {
    if (!(error instanceof GraphQLError)) {
      throw new ServiceUnavailableException({
        error: 'Contact transfer authentication is unavailable',
        code: 'SERVICE_UNAVAILABLE',
      });
    }
    const body = {
      error: error.message,
      code: String(error.extensions.code ?? 'SERVICE_UNAVAILABLE'),
      ...(error.extensions.reason
        ? { reason: String(error.extensions.reason) }
        : {}),
      ...(error.extensions.field
        ? { field: String(error.extensions.field) }
        : {}),
    };
    switch (body.code) {
      case 'UNAUTHENTICATED':
        throw new UnauthorizedException(body);
      case 'BAD_USER_INPUT':
      case 'ORGANIZATION_REQUIRED':
        throw new BadRequestException(body);
      case 'FORBIDDEN':
        throw new ForbiddenException(body);
      default:
        throw new ServiceUnavailableException(body);
    }
  }
}
