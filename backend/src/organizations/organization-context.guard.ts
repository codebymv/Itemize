import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Reflector } from '@nestjs/core';
import { ORGANIZATION_SCOPED_KEY } from '../common/metadata';
import { AuthenticatedGraphqlRequest } from '../auth/graphql-auth.guard';
import { RequestContextService } from '../request-context/request-context.service';
import { OrganizationContextService } from './organization-context.service';

@Injectable()
export class OrganizationContextGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly organizations: OrganizationContextService,
    private readonly requestContext: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType<string>() !== 'graphql') return true;

    const isOrganizationScoped =
      this.reflector.getAllAndOverride<boolean>(ORGANIZATION_SCOPED_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
    if (!isOrganizationScoped) return true;

    const request = GqlExecutionContext.create(context).getContext<{
      req: AuthenticatedGraphqlRequest;
    }>().req;
    const userId = request.user?.id;
    if (!userId) return false;

    const organization = await this.organizations.resolve(
      userId,
      request.headers['x-organization-id'],
    );
    this.requestContext.setOrganization(organization);
    return true;
  }
}
