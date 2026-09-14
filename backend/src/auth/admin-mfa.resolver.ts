import {
  Args,
  Context,
  Field,
  GraphQLISODateTime,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from '@nestjs/graphql';
import { Response } from 'express';
import { AccountScoped, CsrfProtected } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { AdminMfaService } from './admin-mfa.service';
import { AuthRepository } from './auth.repository';
import { AuthEmailService } from './auth-email.service';

@ObjectType()
class AdminMfaStatus {
  @Field() enrolled: boolean;
  @Field() verified: boolean;
  @Field() recovery: boolean;
  @Field() reauthenticated: boolean;
  @Field() sessionRequired: boolean;
  @Field(() => GraphQLISODateTime, { nullable: true }) expiresAt: Date | null;
}
@ObjectType()
class AdminMfaSetup {
  @Field() secret: string;
  @Field() qrDataUrl: string;
  @Field(() => GraphQLISODateTime) expiresAt: Date;
}

@Resolver()
@AccountScoped()
export class AdminMfaResolver {
  constructor(
    private readonly mfa: AdminMfaService,
    private readonly requests: RequestContextService,
    private readonly users: AuthRepository,
    private readonly emails: AuthEmailService,
  ) {}
  private identity(context: { res: Response }) {
    context.res.setHeader('Cache-Control', 'no-store, private');
    return this.requests.current().identity!;
  }
  @Query(() => AdminMfaStatus)
  adminMfaStatus(@Context() context: { res: Response }) {
    return this.mfa.status(this.identity(context));
  }

  @CsrfProtected()
  @Mutation(() => Boolean)
  reauthenticateAdmin(
    @Context() context: { res: Response },
    @Args('password', { type: () => String, nullable: true }) password?: string,
    @Args('googleAccessToken', { type: () => String, nullable: true })
    googleAccessToken?: string,
  ) {
    return this.mfa.reauthenticate(
      this.identity(context),
      password,
      googleAccessToken,
    );
  }
  @CsrfProtected()
  @Mutation(() => AdminMfaSetup)
  beginAdminMfaSetup(@Context() context: { res: Response }) {
    return this.mfa.begin(this.identity(context));
  }

  @CsrfProtected()
  @Mutation(() => [String])
  async confirmAdminMfaSetup(
    @Context() context: { res: Response },
    @Args('code') code: string,
  ) {
    const identity = this.identity(context);
    const codes = await this.mfa.confirm(identity, code);
    const user = await this.users.findById(identity.userId);
    if (user) await this.emails.sendMfaChanged(user);
    return codes;
  }
  @CsrfProtected()
  @Mutation(() => Boolean)
  verifyAdminMfa(
    @Context() context: { res: Response },
    @Args('code') code: string,
  ) {
    return this.mfa.challenge(this.identity(context), code);
  }
  @CsrfProtected()
  @Mutation(() => Boolean)
  async recoverAdminMfa(
    @Context() context: { res: Response },
    @Args('code') code: string,
  ) {
    const identity = this.identity(context);
    const result = await this.mfa.recover(identity, code);
    const user = await this.users.findById(identity.userId);
    if (user) await this.emails.sendMfaChanged(user);
    return result;
  }
  @CsrfProtected()
  @Mutation(() => Boolean)
  lockAdminMfa(@Context() context: { res: Response }) {
    return this.mfa.lock(this.identity(context));
  }
}
