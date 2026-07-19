import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { PageInput } from '../common/pagination';
import { RequestContextService } from '../request-context/request-context.service';
import {
  CreateEstimateInput,
  EstimateFilterInput,
  UpdateEstimateInput,
} from './estimate.inputs';
import {
  DeleteEstimateResult,
  Estimate,
  EstimatePage,
} from './estimate.types';
import { EstimatesService } from './estimates.service';

@Resolver(() => Estimate)
export class EstimatesResolver {
  constructor(
    private readonly estimates: EstimatesService,
    private readonly requestContext: RequestContextService,
  ) {}

  @OrganizationScoped()
  @Query(() => EstimatePage, { name: 'estimates' })
  estimatePage(
    @Args('filter', { nullable: true }) filter?: EstimateFilterInput,
    @Args('page', { nullable: true }) page?: PageInput,
  ): Promise<EstimatePage> {
    return this.estimates.list(this.organizationId(), filter, page);
  }

  @OrganizationScoped()
  @Query(() => Estimate)
  estimate(@Args('id', { type: () => Int }) id: number): Promise<Estimate> {
    return this.estimates.get(this.organizationId(), id);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Estimate)
  createEstimate(@Args('input') input: CreateEstimateInput): Promise<Estimate> {
    return this.estimates.create(this.organizationId(), this.userId(), input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Estimate)
  updateEstimate(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: UpdateEstimateInput,
  ): Promise<Estimate> {
    return this.estimates.update(this.organizationId(), id, input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => DeleteEstimateResult)
  deleteEstimate(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<DeleteEstimateResult> {
    return this.estimates.delete(this.organizationId(), id);
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
