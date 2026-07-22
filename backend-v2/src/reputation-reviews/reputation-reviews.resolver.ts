import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { PageInput } from '../common/pagination';
import { RequestContextService } from '../request-context/request-context.service';
import {
  CreateReputationReviewInput,
  ReputationReviewFilterInput,
  UpdateReputationReviewInput,
} from './reputation-review.inputs';
import {
  DeleteReputationReviewResult,
  ReputationReview,
  ReputationReviewPage,
} from './reputation-review.types';
import { ReputationReviewsService } from './reputation-reviews.service';

@Resolver(() => ReputationReview)
export class ReputationReviewsResolver {
  constructor(
    private readonly reviews: ReputationReviewsService,
    private readonly requestContext: RequestContextService,
  ) {}

  @OrganizationScoped()
  @Query(() => ReputationReviewPage)
  reputationReviews(
    @Args('filter', { nullable: true }) filter?: ReputationReviewFilterInput,
    @Args('page', { nullable: true }) page?: PageInput,
  ): Promise<ReputationReviewPage> {
    return this.reviews.list(this.organizationId(), filter, page);
  }

  @OrganizationScoped()
  @Query(() => ReputationReview)
  reputationReview(@Args('id', { type: () => Int }) id: number): Promise<ReputationReview> {
    return this.reviews.get(this.organizationId(), id);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => ReputationReview)
  createReputationReview(
    @Args('input') input: CreateReputationReviewInput,
  ): Promise<ReputationReview> {
    return this.reviews.create(this.organizationId(), input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => ReputationReview)
  updateReputationReview(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: UpdateReputationReviewInput,
  ): Promise<ReputationReview> {
    return this.reviews.update(this.organizationId(), this.userId(), id, input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => DeleteReputationReviewResult)
  async deleteReputationReview(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<DeleteReputationReviewResult> {
    return { deletedId: await this.reviews.delete(this.organizationId(), id) };
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
