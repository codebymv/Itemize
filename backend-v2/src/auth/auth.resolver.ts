import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Request, Response } from 'express';
import { CsrfProtected, Public } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import {
  ChangePasswordInput,
  GoogleAccessTokenInput,
  LoginInput,
  RegisterInput,
  RequestPasswordResetInput,
  ResetPasswordInput,
  ResendVerificationInput,
  UpdateViewerProfileInput,
  VerifyEmailInput,
} from './auth.inputs';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { IdentityLifecycleService } from './identity-lifecycle.service';
import { SessionService } from './session.service';
import {
  AuthMessagePayload,
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
    private readonly identityLifecycle: IdentityLifecycleService,
    private readonly rateLimit: AuthRateLimitService,
    private readonly requestContext: RequestContextService,
  ) {}

  @Public()
  @Mutation(() => AuthMessagePayload)
  register(
    @Args('input') input: RegisterInput,
    @Context() context: GraphqlHttpContext,
  ) {
    this.rateLimit.consume(context.req, input.email);
    return this.identityLifecycle.register(input.email, input.password, input.name);
  }

  @Public()
  @Mutation(() => AuthSessionPayload)
  verifyEmail(
    @Args('input') input: VerifyEmailInput,
    @Context() context: GraphqlHttpContext,
  ) {
    this.rateLimit.consume(context.req);
    return this.identityLifecycle.verifyEmail(input.token, context.res);
  }

  @Public()
  @Mutation(() => AuthMessagePayload)
  resendVerificationEmail(
    @Args('input') input: ResendVerificationInput,
    @Context() context: GraphqlHttpContext,
  ) {
    this.rateLimit.consumeStrict(context.req, input.email);
    return this.identityLifecycle.resendVerification(input.email);
  }

  @Public()
  @Mutation(() => AuthMessagePayload)
  requestPasswordReset(
    @Args('input') input: RequestPasswordResetInput,
    @Context() context: GraphqlHttpContext,
  ) {
    this.rateLimit.consumeStrict(context.req, input.email);
    return this.identityLifecycle.requestPasswordReset(input.email);
  }

  @Public()
  @Mutation(() => AuthMessagePayload)
  resetPassword(
    @Args('input') input: ResetPasswordInput,
    @Context() context: GraphqlHttpContext,
  ) {
    this.rateLimit.consume(context.req);
    return this.identityLifecycle.resetPassword(input.token, input.password);
  }

  @CsrfProtected()
  @Mutation(() => AuthMessagePayload)
  changePassword(@Args('input') input: ChangePasswordInput) {
    const identity = this.requestContext.current().identity;
    if (!identity) throw new Error('Verified user identity is unavailable');
    return this.identityLifecycle.changePassword(
      identity.userId,
      input.currentPassword,
      input.newPassword,
    );
  }

  @CsrfProtected()
  @Mutation(() => CurrentUser)
  updateViewerProfile(@Args('input') input: UpdateViewerProfileInput) {
    const identity = this.requestContext.current().identity;
    if (!identity) throw new Error('Verified user identity is unavailable');
    return this.identityLifecycle.updateViewerProfile(identity.userId, input.name);
  }

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
