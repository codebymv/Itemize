import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { itemizeGraphqlError } from '../common/graphql-error';
import { IS_PUBLIC_KEY } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { AccessTokenService } from './access-token.service';

export type AuthenticatedGraphqlRequest = Request & {
  user?: { id: number };
};

@Injectable()
export class GraphqlAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessTokens: AccessTokenService,
    private readonly requestContext: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = GqlExecutionContext.create(context).getContext<{
      req: AuthenticatedGraphqlRequest;
    }>().req;
    const token = request.cookies?.itemize_auth;
    if (typeof token !== 'string' || token.length === 0) {
      throw itemizeGraphqlError('Authentication required', 'UNAUTHENTICATED');
    }

    const identity = await this.accessTokens.verify(token);
    request.user = { id: identity.userId };
    this.requestContext.setIdentity(identity);
    return true;
  }
}
