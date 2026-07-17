import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccessTokenService } from './access-token.service';
import { GraphqlAuthGuard } from './graphql-auth.guard';
import { GraphqlCsrfGuard } from './graphql-csrf.guard';

@Module({
  imports: [JwtModule.register({})],
  providers: [AccessTokenService, GraphqlAuthGuard, GraphqlCsrfGuard],
  exports: [AccessTokenService, GraphqlAuthGuard, GraphqlCsrfGuard],
})
export class AuthModule {}
