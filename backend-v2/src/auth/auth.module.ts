import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccessTokenService } from './access-token.service';
import { GraphqlAuthGuard } from './graphql-auth.guard';

@Module({
  imports: [JwtModule.register({})],
  providers: [AccessTokenService, GraphqlAuthGuard],
  exports: [AccessTokenService, GraphqlAuthGuard],
})
export class AuthModule {}
