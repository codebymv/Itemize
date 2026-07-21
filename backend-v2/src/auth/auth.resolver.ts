import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Request, Response } from 'express';
import { CsrfProtected, Public } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { GoogleAccessTokenInput, LoginInput } from './auth.inputs';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { SessionService } from './session.service';
import {
  AuthSessionPayload,
  AuthSessionStatus,
  CsrfTokenPayload,
  CurrentUser,
} from './auth.types';

type GraphqlHttpContext = { req: Request; res: Response };

@Resolver()
export class AuthResolver {
  constructor(
    private readonly sessions: SessionService,
    private readonly rateLimit: AuthRateLimitService,
    private readonly requestContext: RequestContextService,
  ) {}

  @Public()
  @Mutation(() => AuthSessionPayload)
  login(@Args('input') input: LoginInput, @Context() context: GraphqlHttpContext) {
    this.rateLimit.consume(context.req, input.email);
    return this.sessions.login(input.email, input.password, context.res);
  }

  @Public()
  @Mutation(() => AuthSessionPayload)
  loginWithGoogleAccessToken(
    @Args('input') input: GoogleAccessTokenInput,
    @Context() context: GraphqlHttpContext,
  ) {
    this.rateLimit.consume(context.req);
    return this.sessions.googleLogin(input.accessToken, context.res);
  }

  @Query(() => CurrentUser)
  currentUser(): Promise<CurrentUser> {
    const identity = this.requestContext.current().identity;
    if (!identity) throw new Error('Verified user identity is unavailable');
    return this.sessions.currentUser(identity.userId);
  }

  @Public()
  @Query(() => CsrfTokenPayload)
  csrfToken(@Context() context: GraphqlHttpContext): CsrfTokenPayload {
    return {
      token: this.sessions.csrfToken(
        context.req.cookies?.['csrf-token'],
        context.res,
      ),
    };
  }

  @Public()
  @CsrfProtected()
  @Mutation(() => AuthSessionStatus)
  refreshSession(@Context() context: GraphqlHttpContext) {
    return this.sessions.refresh(context.req.cookies?.itemize_refresh, context.res);
  }

  @Public()
  @CsrfProtected()
  @Mutation(() => AuthSessionStatus)
  logout(@Context() context: GraphqlHttpContext): AuthSessionStatus {
    return this.sessions.logout(context.res);
  }
}
