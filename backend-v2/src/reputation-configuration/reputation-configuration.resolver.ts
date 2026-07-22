import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import {
  CreateReputationWidgetInput,
  UpdateReputationSettingsInput,
  UpdateReputationWidgetInput,
  UpsertReputationPlatformInput,
} from './reputation-configuration.inputs';
import { ReputationConfigurationService } from './reputation-configuration.service';
import {
  DeleteReputationPlatformResult,
  DeleteReputationWidgetResult,
  ReputationPlatform,
  ReputationSettings,
  ReputationWidget,
  ReputationWidgetEmbedCode,
} from './reputation-configuration.types';

@Resolver()
export class ReputationConfigurationResolver {
  constructor(
    private readonly configuration: ReputationConfigurationService,
    private readonly requestContext: RequestContextService,
  ) {}

  @OrganizationScoped()
  @Query(() => [ReputationPlatform])
  reputationPlatforms(): Promise<ReputationPlatform[]> {
    return this.configuration.platforms(this.organizationId());
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => ReputationPlatform)
  upsertReputationPlatform(
    @Args('input') input: UpsertReputationPlatformInput,
  ): Promise<ReputationPlatform> {
    return this.configuration.upsertPlatform(this.organizationId(), input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => DeleteReputationPlatformResult)
  async deleteReputationPlatform(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<DeleteReputationPlatformResult> {
    return { deletedId: await this.configuration.deletePlatform(this.organizationId(), id) };
  }

  @OrganizationScoped()
  @Query(() => [ReputationWidget])
  reputationWidgets(): Promise<ReputationWidget[]> {
    return this.configuration.widgets(this.organizationId());
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => ReputationWidget)
  createReputationWidget(
    @Args('input') input: CreateReputationWidgetInput,
  ): Promise<ReputationWidget> {
    return this.configuration.createWidget(this.organizationId(), input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => ReputationWidget)
  updateReputationWidget(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: UpdateReputationWidgetInput,
  ): Promise<ReputationWidget> {
    return this.configuration.updateWidget(this.organizationId(), id, input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => DeleteReputationWidgetResult)
  async deleteReputationWidget(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<DeleteReputationWidgetResult> {
    return { deletedId: await this.configuration.deleteWidget(this.organizationId(), id) };
  }

  @OrganizationScoped()
  @Query(() => ReputationWidgetEmbedCode)
  reputationWidgetEmbedCode(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<ReputationWidgetEmbedCode> {
    return this.configuration.widgetEmbedCode(this.organizationId(), id);
  }

  @OrganizationScoped()
  @Query(() => ReputationSettings)
  reputationSettings(): Promise<ReputationSettings> {
    return this.configuration.settings(this.organizationId());
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => ReputationSettings)
  updateReputationSettings(
    @Args('input') input: UpdateReputationSettingsInput,
  ): Promise<ReputationSettings> {
    return this.configuration.updateSettings(this.organizationId(), input);
  }

  private organizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization) throw new Error('Verified organization context is unavailable');
    return organization.organizationId;
  }
}
