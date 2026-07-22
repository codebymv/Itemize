import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { PageInput } from '../common/pagination';
import { RequestContextService } from '../request-context/request-context.service';
import {
  ReputationRequestFilterInput,
  SendBulkReputationRequestsInput,
  SendReputationRequestInput,
} from './reputation-request.inputs';
import {
  DeleteReputationRequestResult,
  ReputationRequest,
  ReputationRequestDeliveryResult,
  ReputationRequestPage,
} from './reputation-request.types';
import { ReputationRequestDeliveryService } from './reputation-request-delivery.service';
import { ReputationRequestsService } from './reputation-requests.service';

@Resolver(() => ReputationRequest)
export class ReputationRequestsResolver {
  constructor(
    private readonly requests: ReputationRequestsService,
    private readonly delivery: ReputationRequestDeliveryService,
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

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => ReputationRequestDeliveryResult)
  sendReputationRequest(
    @Args('input') input: SendReputationRequestInput,
  ): Promise<ReputationRequestDeliveryResult> {
    return this.delivery.send(this.organizationId(), this.userId(), input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => ReputationRequestDeliveryResult)
  sendBulkReputationRequests(
    @Args('input') input: SendBulkReputationRequestsInput,
  ): Promise<ReputationRequestDeliveryResult> {
    return this.delivery.bulk(this.organizationId(), this.userId(), input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => ReputationRequestDeliveryResult)
  resendReputationRequest(
    @Args('id', { type: () => Int }) id: number,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<ReputationRequestDeliveryResult> {
    return this.delivery.resend(this.organizationId(), this.userId(), id, idempotencyKey);
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
