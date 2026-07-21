import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { PageInput } from '../common/pagination';
import { RequestContextService } from '../request-context/request-context.service';
import {
  CampaignFilterInput,
  CreateCampaignInput,
  ScheduleCampaignInput,
  UpdateCampaignInput,
} from './campaign.inputs';
import { Campaign, CampaignPage, DeleteCampaignResult } from './campaign.types';
import { CampaignsService } from './campaigns.service';

@Resolver(() => Campaign)
export class CampaignsResolver {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly requestContext: RequestContextService,
  ) {}

  @OrganizationScoped()
  @Query(() => CampaignPage)
  campaigns(
    @Args('filter', { nullable: true }) filter?: CampaignFilterInput,
    @Args('page', { nullable: true }) page?: PageInput,
  ): Promise<CampaignPage> {
    return this.campaignsService.list(this.organizationId(), filter, page);
  }

  @OrganizationScoped()
  @Query(() => Campaign)
  campaign(@Args('id', { type: () => Int }) id: number): Promise<Campaign> {
    return this.campaignsService.detail(this.organizationId(), id);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Campaign)
  createCampaign(@Args('input') input: CreateCampaignInput): Promise<Campaign> {
    return this.campaignsService.create(this.organizationId(), this.userId(), input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Campaign)
  updateCampaign(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: UpdateCampaignInput,
  ): Promise<Campaign> {
    return this.campaignsService.update(this.organizationId(), id, input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Campaign)
  duplicateCampaign(@Args('id', { type: () => Int }) id: number): Promise<Campaign> {
    return this.campaignsService.duplicate(this.organizationId(), id, this.userId());
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => DeleteCampaignResult)
  deleteCampaign(@Args('id', { type: () => Int }) id: number): Promise<DeleteCampaignResult> {
    return this.campaignsService.delete(this.organizationId(), id);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Campaign)
  scheduleCampaign(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: ScheduleCampaignInput,
  ): Promise<Campaign> {
    return this.campaignsService.schedule(this.organizationId(), id, input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Campaign)
  unscheduleCampaign(@Args('id', { type: () => Int }) id: number): Promise<Campaign> {
    return this.campaignsService.unschedule(this.organizationId(), id);
  }

  private organizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization) throw new Error('Verified organization context is unavailable');
    return organization.organizationId;
  }

  private userId(): number {
    const identity = this.requestContext.current().identity;
    if (!identity) throw new Error('Verified identity context is unavailable');
    return identity.userId;
  }
}
