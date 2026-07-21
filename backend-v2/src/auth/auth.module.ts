import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccessTokenService } from './access-token.service';
import { AuthRepository } from './auth.repository';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthResolver } from './auth.resolver';
import { GraphqlAuthGuard } from './graphql-auth.guard';
import { GraphqlCsrfGuard } from './graphql-csrf.guard';
import { SessionService } from './session.service';

@Module({
  imports: [JwtModule.register({})],
  providers: [
    AccessTokenService,
    AuthRepository,
    AuthRateLimitService,
    AuthResolver,
    GraphqlAuthGuard,
    GraphqlCsrfGuard,
    SessionService,
  ],
  exports: [AccessTokenService, GraphqlAuthGuard, GraphqlCsrfGuard],
})
export class AuthModule {}
