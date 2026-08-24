import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AccessTokenService } from '../auth/access-token.service';
import { OrganizationContextService } from '../organizations/organization-context.service';
import { RequestContextService } from '../request-context/request-context.service';

/**
 * Cookie-JWT plus organization resolution for retained HTTP routes,
 * answering with the retained authenticateJWT error dialect. Routes
 * that were not entitlement gated in the legacy origin use this guard
 * unchanged.
 */
@Injectable()
export class SessionOrganizationGuard implements CanActivate {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly organizations: OrganizationContextService,
    private readonly requestContext: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = (request as Request & { cookies?: Record<string, string> })
      .cookies?.itemize_auth;
    if (typeof token !== 'string' || token.length === 0) {
      throw new UnauthorizedException({
        success: false,
        error: { message: 'Authentication required', code: 'NO_TOKEN' },
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
      return true;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new UnauthorizedException({
        success: false,
        error: { message: 'Invalid token', code: 'INVALID_TOKEN' },
      });
    }
  }
}
