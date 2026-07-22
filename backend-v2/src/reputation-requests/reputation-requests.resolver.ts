import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { PageInput } from '../common/pagination';
import { RequestContextService } from '../request-context/request-context.service';
import { ReputationRequestFilterInput } from './reputation-request.inputs';
import {
  DeleteReputationRequestResult,
  ReputationRequest,
  ReputationRequestPage,
} from './reputation-request.types';
import { ReputationRequestsService } from './reputation-requests.service';

@Resolver(() => ReputationRequest)
export class ReputationRequestsResolver {
  constructor(
    private readonly requests: ReputationRequestsService,
    private readonly requestContext: RequestContextService,
  ) {}

  @OrganizationScoped()
  @Query(() => ReputationRequestPage)
  reputationRequests(
    @Args('filter', { nullable: true }) filter?: ReputationRequestFilterInput,
    @Args('page', { nullable: true }) page?: PageInput,
  ): Promise<ReputationRequestPage> {
    return this.requests.list(this.organizationId(), filter, page);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => DeleteReputationRequestResult)
  async deleteReputationRequest(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<DeleteReputationRequestResult> {
    return { deletedId: await this.requests.delete(this.organizationId(), id) };
  }

  private organizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization) throw new Error('Verified organization context is unavailable');
    return organization.organizationId;
  }
}
