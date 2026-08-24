import { UseGuards } from '@nestjs/common';
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { AdminAccessGuard } from './admin-access.guard';
import { AdminUserIdsInput, AdminUserSearchInput } from './admin-operations.inputs';
import { AdminOperationsService } from './admin-operations.service';
import { AdminActivationFunnel, AdminJobQueueDetails, AdminOperationsSnapshot, AdminPlanUpdate, AdminSystemStats, AdminUser, AdminUserCount, AdminUserIds, AdminUserSearchResult } from './admin-operations.types';

@UseGuards(AdminAccessGuard)
@Resolver()
export class AdminOperationsResolver {
  constructor(private readonly service: AdminOperationsService, private readonly requestContext: RequestContextService) {}

  @Query(() => AdminUserCount) adminUserCount(): Promise<AdminUserCount> { return this.service.userCount(); }
  @Query(() => AdminUserSearchResult) adminUsers(@Args('input', { nullable: true }) input?: AdminUserSearchInput): Promise<AdminUserSearchResult> { return this.service.search(input); }
  @Query(() => AdminUserIds) adminUserIds(@Args('input', { nullable: true }) input?: AdminUserIdsInput): Promise<AdminUserIds> { return this.service.ids(input); }
  @Query(() => [AdminUser]) adminUsersByIds(@Args('ids', { type: () => [Int] }) ids: number[]): Promise<AdminUser[]> { return this.service.byIds(ids); }
  @Query(() => AdminSystemStats) adminSystemStats(): Promise<AdminSystemStats> { return this.service.stats(); }
  @Query(() => AdminOperationsSnapshot) adminOperationsSnapshot(): Promise<AdminOperationsSnapshot> {
    return this.service.operationsSnapshot();
  }
  @Query(() => AdminJobQueueDetails) adminJobQueueDetails(
    @Args('queueId') queueId: string,
    @Args('bucket', { nullable: true }) bucket?: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('offset', { type: () => Int, nullable: true }) offset?: number,
  ): Promise<AdminJobQueueDetails> {
    return this.service.jobQueueDetails(queueId, bucket, limit, offset);
  }
  @Query(() => AdminActivationFunnel) adminActivationFunnel(
    @Args('days', { type: () => Int, nullable: true }) days?: number,
  ): Promise<AdminActivationFunnel> { return this.service.activationFunnel(days); }

  @CsrfProtected()
  @Mutation(() => AdminPlanUpdate)
  updateAdminOwnPlan(@Args('plan') plan: string): Promise<AdminPlanUpdate> {
    const identity = this.requestContext.current().identity;
    if (!identity) throw new Error('Verified identity context is unavailable');
    return this.service.updateOwnPlan(identity.userId, plan);
  }
}
