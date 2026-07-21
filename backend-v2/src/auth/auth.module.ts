import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccessTokenService } from './access-token.service';
import { AuthRepository } from './auth.repository';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthResolver } from './auth.resolver';
import { AuthEmailService } from './auth-email.service';
import { GraphqlAuthGuard } from './graphql-auth.guard';
import { GraphqlCsrfGuard } from './graphql-csrf.guard';
import { SessionService } from './session.service';
import { IdentityLifecycleService } from './identity-lifecycle.service';

@Module({
  imports: [JwtModule.register({})],
  providers: [
    AccessTokenService,
    AuthEmailService,
    AuthRepository,
    AuthRateLimitService,
    AuthResolver,
    GraphqlAuthGuard,
    GraphqlCsrfGuard,
    IdentityLifecycleService,
    SessionService,
  ],
  exports: [AccessTokenService, GraphqlAuthGuard, GraphqlCsrfGuard],
})
export class AuthModule {}
