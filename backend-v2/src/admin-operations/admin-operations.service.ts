import { Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';
import { AdminUserIdsInput, AdminUserSearchInput } from './admin-operations.inputs';
import { AdminOperationsRepository, AdminUserRow } from './admin-operations.repository';
import { AdminPlanUpdate, AdminSystemStats, AdminUser, AdminUserCount, AdminUserIds, AdminUserSearchResult } from './admin-operations.types';

const PLANS = new Set(['free', 'starter', 'unlimited', 'pro']);

@Injectable()
export class AdminOperationsService {
  constructor(private readonly repository: AdminOperationsRepository) {}

  async userCount(): Promise<AdminUserCount> { return { count: await this.repository.userCount() }; }

  async search(input: AdminUserSearchInput = {}): Promise<AdminUserSearchResult> {
    const query = this.query(input.query);
    const plan = this.plan(input.plan, true);
    const page = input.page ?? 0;
    const limit = input.limit ?? 50;
    if (!Number.isSafeInteger(page) || page < 0) this.bad('Page must be a non-negative integer', 'input.page');
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) this.bad('Limit must be between 1 and 100', 'input.limit');
    const result = await this.repository.searchUsers({ query, plan, limit, offset: page * limit });
    return { users: result.rows.slice(0, limit).map(this.mapUser), total: result.total, hasMore: result.rows.length > limit };
  }

  async ids(input: AdminUserIdsInput = {}): Promise<AdminUserIds> {
    return { ids: await this.repository.userIds(this.query(input.query), this.plan(input.plan, true)) };
  }

  async byIds(ids: number[]): Promise<AdminUser[]> {
    if (ids.length > 100) this.bad('At most 100 user IDs may be requested', 'ids');
    const unique = [...new Set(ids)];
    if (unique.some((id) => !Number.isSafeInteger(id) || id < 1)) this.bad('User IDs must be positive integers', 'ids');
    return unique.length ? (await this.repository.usersByIds(unique)).map(this.mapUser) : [];
  }

  stats(): Promise<AdminSystemStats> { return this.repository.stats(); }

  async updateOwnPlan(userId: number, requestedPlan: string): Promise<AdminPlanUpdate> {
    const plan = this.plan(requestedPlan, false)!;
    const result = await this.repository.updateOwnPlan(userId, plan);
    if (result === 'no_organization') this.bad('No organization associated with user', 'plan');
    if (result === 'plan_not_found') this.bad(`Plan "${plan}" is unavailable`, 'plan');
    return { message: `Plan updated to ${plan}`, plan };
  }

  private readonly mapUser = (row: AdminUserRow): AdminUser => ({
    id: row.id, email: row.email, name: row.name, role: row.role || 'USER',
    plan: row.plan || 'free', createdAt: row.created_at,
  });

  private query(value?: string): string | undefined {
    const query = value?.trim();
    if (!query) return undefined;
    if (query.length > 255) this.bad('Query must be at most 255 characters', 'input.query');
    return query;
  }

  private plan(value: string | undefined, allowAll: boolean): string | undefined {
    if (value === undefined || (allowAll && value.toLowerCase() === 'all')) return undefined;
    const plan = value.trim().toLowerCase();
    if (!PLANS.has(plan)) this.bad(`Plan must be one of: ${[...PLANS].join(', ')}`, 'plan');
    return plan;
  }

  private bad(message: string, field: string): never {
    throw itemizeGraphqlError(message, 'BAD_USER_INPUT', { field });
  }
}
