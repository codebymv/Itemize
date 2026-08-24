import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { Request, Response } from 'express';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { GraphqlEntitlementGuard } from './billing/graphql-entitlement.guard';
import { AdminOperationsModule } from './admin-operations/admin-operations.module';
import { AdminMessagingModule } from './admin-messaging/admin-messaging.module';
import { MessagingDeliveryModule } from './admin-messaging/messaging-delivery.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AiModule } from './ai/ai.module';
import { GraphqlAuthGuard } from './auth/graphql-auth.guard';
import { GraphqlCsrfGuard } from './auth/graphql-csrf.guard';
import { BookingsModule } from './bookings/bookings.module';
import { CalendarIntegrationsModule } from './calendar-integrations/calendar-integrations.module';
import { ChatWidgetModule } from './chat-widget/chat-widget.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { CampaignDeliveryModule } from './campaign-delivery/campaign-delivery.module';
import { CategoriesModule } from './categories/categories.module';
import { CalendarsModule } from './calendars/calendars.module';
import { formatItemizeGraphqlError } from './common/graphql-error';
import { RuntimeConfigModule } from './common/runtime-config.module';
import { ContactTransfersModule } from './contact-transfers/contact-transfers.module';
import { ContactsModule } from './contacts/contacts.module';
import { ConversationsModule } from './conversations/conversations.module';
import { DatabaseModule } from './database/database.module';
import { DealsModule } from './deals/deals.module';
import { EstimatesModule } from './estimates/estimates.module';
import { EmailTemplatesModule } from './email-templates/email-templates.module';
import { SmsTemplatesModule } from './sms-templates/sms-templates.module';
import { SocialModule } from './social/social.module';
import { SignatureDocumentsModule } from './signature-documents/signature-documents.module';
import { SignatureDeliveryModule } from './signature-delivery/signature-delivery.module';
import { SignatureFilesModule } from './signature-files/signature-files.module';
import { CalendarOAuthModule } from './calendar-oauth/calendar-oauth.module';
import { ChatWidgetPublicModule } from './chat-widget-public/chat-widget-public.module';
import { EmailWebhooksModule } from './email-webhooks/email-webhooks.module';
import { SmsWebhooksModule } from './sms-webhooks/sms-webhooks.module';
import { SocialOAuthModule } from './social-oauth/social-oauth.module';
import { SocialWebhooksModule } from './social-webhooks/social-webhooks.module';
import { StripeConnectModule } from './stripe-connect/stripe-connect.module';
import { SubscriptionWebhooksModule } from './subscription-webhooks/subscription-webhooks.module';
import { WorkflowWebhooksModule } from './workflow-webhooks/workflow-webhooks.module';
import { PublicBookingsModule } from './public-bookings/public-bookings.module';
import { PublicFormsModule } from './public-forms/public-forms.module';
import { PublicLandingPagesModule } from './public-landing-pages/public-landing-pages.module';
import { PublicReputationModule } from './public-reputation/public-reputation.module';
import { PublicSharingModule } from './public-sharing/public-sharing.module';
import { RealtimeHostModule } from './realtime-host/realtime-host.module';
import { PublicSigningModule } from './public-signing/public-signing.module';
import { SignatureTemplatesModule } from './signature-templates/signature-templates.module';
import { SignatureJobsSchedulerService } from './signature-jobs/signature-jobs-scheduler.service';
import { FoundationModule } from './foundation/foundation.module';
import { FormsModule } from './forms/forms.module';
import { InvoiceBusinessesModule } from './invoice-businesses/invoice-businesses.module';
import { InvoiceJobsModule } from './invoice-jobs/invoice-jobs.module';
import { InvoiceLogoCleanupModule } from './invoice-logo-cleanup/invoice-logo-cleanup.module';
import { InvoiceLogoUploadsModule } from './invoice-logo-uploads/invoice-logo-uploads.module';
import { InvoiceSettingsModule } from './invoice-settings/invoice-settings.module';
import { InvoiceWebhooksModule } from './invoice-webhooks/invoice-webhooks.module';
import { InvoicesModule } from './invoices/invoices.module';
import { LandingPagesModule } from './landing-pages/landing-pages.module';
import { GetStartedModule } from './get-started/get-started.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { OrganizationContextGuard } from './organizations/organization-context.guard';
import { OrganizationsModule } from './organizations/organizations.module';
import { createGraphqlObservabilityPlugin } from './observability/graphql-observability.plugin';
import { PipelinesModule } from './pipelines/pipelines.module';
import { PaymentsModule } from './payments/payments.module';
import { ProductsModule } from './products/products.module';
import { RecurringInvoicesModule } from './recurring-invoices/recurring-invoices.module';
import { ReputationConfigurationModule } from './reputation-configuration/reputation-configuration.module';
import { ReputationReviewsModule } from './reputation-reviews/reputation-reviews.module';
import { ReputationRequestsModule } from './reputation-requests/reputation-requests.module';
import { RequestContextMiddleware } from './request-context/request-context.middleware';
import { RequestContextModule } from './request-context/request-context.module';
import { SegmentsModule } from './segments/segments.module';
import { TagsModule } from './tags/tags.module';
import { TrialRemindersModule } from './trial-reminders/trial-reminders.module';
import { VaultModule } from './vaults/vault.module';
import { WorkspaceContentModule } from './workspace-content/workspace-content.module';
import { RealtimeOutboxModule } from './realtime-outbox/realtime-outbox.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { WorkflowExecutionModule } from './workflow-execution/workflow-execution.module';
import { WorkflowJobsModule } from './workflow-jobs/workflow-jobs.module';

// Apollo's conditional exports expose distinct ESM/CJS private HeaderMap types to
// ts-jest even though the plugin is runtime-compatible with Nest's Apollo driver.
const observabilityPlugins = [
  createGraphqlObservabilityPlugin(),
] as unknown as NonNullable<ApolloDriverConfig['plugins']>;

@Module({
  imports: [
    RuntimeConfigModule,
    RequestContextModule,
    DatabaseModule,
    AuthModule,
    BillingModule,
    AdminOperationsModule,
    AdminMessagingModule,
    MessagingDeliveryModule,
    AnalyticsModule,
    AiModule,
    OrganizationsModule,
    CalendarsModule,
    CalendarIntegrationsModule,
    ChatWidgetModule,
    CampaignsModule,
    SegmentsModule,
    CampaignDeliveryModule,
    BookingsModule,
    CategoriesModule,
    VaultModule,
    WorkspaceContentModule,
    RealtimeOutboxModule,
    ContactsModule,
    ConversationsModule,
    ContactTransfersModule,
    DealsModule,
    EmailTemplatesModule,
    SmsTemplatesModule,
    SocialModule,
    SignatureDocumentsModule,
    SignatureDeliveryModule,
    SignatureFilesModule,
    CalendarOAuthModule,
    ChatWidgetPublicModule,
    EmailWebhooksModule,
    SmsWebhooksModule,
    SocialOAuthModule,
    SocialWebhooksModule,
    StripeConnectModule,
    SubscriptionWebhooksModule,
    WorkflowWebhooksModule,
    PublicBookingsModule,
    PublicFormsModule,
    PublicLandingPagesModule,
    PublicReputationModule,
    PublicSharingModule,
    PublicSigningModule,
    RealtimeHostModule,
    SignatureTemplatesModule,
    EstimatesModule,
    PipelinesModule,
    PaymentsModule,
    ProductsModule,
    RecurringInvoicesModule,
    ReputationConfigurationModule,
    ReputationReviewsModule,
    ReputationRequestsModule,
    TagsModule,
    TrialRemindersModule,
    FormsModule,
    InvoiceBusinessesModule,
    InvoiceJobsModule,
    InvoiceLogoCleanupModule,
    InvoiceLogoUploadsModule,
    InvoiceSettingsModule,
    InvoiceWebhooksModule,
    InvoicesModule,
    LandingPagesModule,
    GetStartedModule,
    OnboardingModule,
    FoundationModule,
    WorkflowsModule,
    WorkflowExecutionModule,
    WorkflowJobsModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      path: '/graphql',
      autoSchemaFile: true,
      sortSchema: true,
      graphiql: process.env.NODE_ENV !== 'production',
      context: ({ req, res }: { req: Request; res: Response }) => ({ req, res }),
      formatError: formatItemizeGraphqlError,
      plugins: observabilityPlugins,
    }),
  ],
  providers: [
    SignatureJobsSchedulerService,
    { provide: APP_GUARD, useExisting: GraphqlAuthGuard },
    { provide: APP_GUARD, useExisting: GraphqlCsrfGuard },
    { provide: APP_GUARD, useExisting: OrganizationContextGuard },
    { provide: APP_GUARD, useExisting: GraphqlEntitlementGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*path');
  }
}
