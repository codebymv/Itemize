import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { PageInput } from '../common/pagination';
import { RequestContextService } from '../request-context/request-context.service';
import {
  CreateDealInput,
  DealFilterInput,
  DealSortInput,
  UpdateDealInput,
} from './deal.inputs';
import { Deal, DealPage, DeleteDealResult } from './deal.types';
import { DealsService } from './deals.service';

@Resolver(() => Deal)
export class DealsResolver {
  constructor(
    private readonly deals: DealsService,
    private readonly requestContext: RequestContextService,
  ) {}

  @OrganizationScoped()
  @Query(() => DealPage, { name: 'deals' })
  dealsList(
    @Args('filter', { nullable: true }) filter?: DealFilterInput,
    @Args('sort', { nullable: true }) sort?: DealSortInput,
    @Args('page', { nullable: true }) page?: PageInput,
  ): Promise<DealPage> {
    return this.deals.list(this.organizationId(), filter, sort, page);
  }

  @OrganizationScoped()
  @Query(() => Deal)
  deal(@Args('id', { type: () => Int }) id: number): Promise<Deal> {
    return this.deals.get(this.organizationId(), id);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Deal)
  createDeal(@Args('input') input: CreateDealInput): Promise<Deal> {
    return this.deals.create(this.organizationId(), this.userId(), input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Deal)
  updateDeal(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: UpdateDealInput,
  ): Promise<Deal> {
    return this.deals.update(this.organizationId(), this.userId(), id, input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Deal)
  moveDeal(
    @Args('id', { type: () => Int }) id: number,
    @Args('stageId') stageId: string,
  ): Promise<Deal> {
    return this.deals.move(this.organizationId(), this.userId(), id, stageId);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Deal)
  markDealWon(@Args('id', { type: () => Int }) id: number): Promise<Deal> {
    return this.deals.lifecycle(this.organizationId(), this.userId(), id, 'won');
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Deal)
  markDealLost(
    @Args('id', { type: () => Int }) id: number,
    @Args('reason', { type: () => String, nullable: true }) reason?: string,
  ): Promise<Deal> {
    return this.deals.lifecycle(
      this.organizationId(),
      this.userId(),
      id,
      'lost',
      reason,
    );
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Deal)
  reopenDeal(@Args('id', { type: () => Int }) id: number): Promise<Deal> {
    return this.deals.lifecycle(this.organizationId(), this.userId(), id, 'open');
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => DeleteDealResult)
  async deleteDeal(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<DeleteDealResult> {
    return { deletedId: await this.deals.delete(this.organizationId(), id) };
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
