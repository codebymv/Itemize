import { UseGuards } from '@nestjs/common';
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { AdminAccessGuard } from './admin-access.guard';
import { AdminUserIdsInput, AdminUserSearchInput } from './admin-operations.inputs';
import { AdminOperationsService } from './admin-operations.service';
import { AdminPlanUpdate, AdminSystemStats, AdminUser, AdminUserCount, AdminUserIds, AdminUserSearchResult } from './admin-operations.types';

@UseGuards(AdminAccessGuard)
@Resolver()
export class AdminOperationsResolver {
  constructor(private readonly service: AdminOperationsService, private readonly requestContext: RequestContextService) {}

  @Query(() => AdminUserCount) adminUserCount(): Promise<AdminUserCount> { return this.service.userCount(); }
  @Query(() => AdminUserSearchResult) adminUsers(@Args('input', { nullable: true }) input?: AdminUserSearchInput): Promise<AdminUserSearchResult> { return this.service.search(input); }
  @Query(() => AdminUserIds) adminUserIds(@Args('input', { nullable: true }) input?: AdminUserIdsInput): Promise<AdminUserIds> { return this.service.ids(input); }
  @Query(() => [AdminUser]) adminUsersByIds(@Args('ids', { type: () => [Int] }) ids: number[]): Promise<AdminUser[]> { return this.service.byIds(ids); }
  @Query(() => AdminSystemStats) adminSystemStats(): Promise<AdminSystemStats> { return this.service.stats(); }

  @CsrfProtected()
  @Mutation(() => AdminPlanUpdate)
  updateAdminOwnPlan(@Args('plan') plan: string): Promise<AdminPlanUpdate> {
    const identity = this.requestContext.current().identity;
    if (!identity) throw new Error('Verified identity context is unavailable');
    return this.service.updateOwnPlan(identity.userId, plan);
  }
}
