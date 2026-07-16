import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { Request, Response } from 'express';
import { AuthModule } from './auth/auth.module';
import { GraphqlAuthGuard } from './auth/graphql-auth.guard';
import { formatItemizeGraphqlError } from './common/graphql-error';
import { ContactsModule } from './contacts/contacts.module';
import { DatabaseModule } from './database/database.module';
import { FoundationModule } from './foundation/foundation.module';
import { OrganizationContextGuard } from './organizations/organization-context.guard';
import { OrganizationsModule } from './organizations/organizations.module';
import { RequestContextMiddleware } from './request-context/request-context.middleware';
import { RequestContextModule } from './request-context/request-context.module';

@Module({
  imports: [
    RequestContextModule,
    DatabaseModule,
    AuthModule,
    OrganizationsModule,
    ContactsModule,
    FoundationModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      path: '/graphql',
      autoSchemaFile: true,
      sortSchema: true,
      graphiql: process.env.NODE_ENV !== 'production',
      context: ({ req, res }: { req: Request; res: Response }) => ({ req, res }),
      formatError: formatItemizeGraphqlError,
    }),
  ],
  providers: [
    { provide: APP_GUARD, useExisting: GraphqlAuthGuard },
    { provide: APP_GUARD, useExisting: OrganizationContextGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*path');
  }
}
