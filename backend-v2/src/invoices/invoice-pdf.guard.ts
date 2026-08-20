import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { GraphQLError } from 'graphql';
import { AccessTokenService } from '../auth/access-token.service';
import { BillingEntitlementService } from '../billing/billing-entitlement.service';
import { OrganizationContextService } from '../organizations/organization-context.service';
import { RequestContextService } from '../request-context/request-context.service';

@Injectable()
export class InvoicePdfGuard implements CanActivate {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly organizations: OrganizationContextService,
    private readonly requestContext: RequestContextService,
    private readonly entitlements: BillingEntitlementService,
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
      await this.entitlements.assertPlan(organization.organizationId, 'starter');
      return true;
    } catch (error) {
      this.rethrow(error);
    }
  }

  private rethrow(error: unknown): never {
    if (!(error instanceof GraphQLError)) {
      throw new ServiceUnavailableException({
        error: 'Invoice PDF authentication is unavailable',
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
      ...(error.extensions.plan ? { plan: String(error.extensions.plan) } : {}),
      ...(error.extensions.requiredPlan
        ? { requiredPlan: String(error.extensions.requiredPlan) }
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
