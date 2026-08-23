import { Field, Float, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class AdminUser {
  @Field(() => Int) id: number;
  @Field() email: string;
  @Field(() => String, { nullable: true }) name: string | null;
  @Field() role: string;
  @Field() plan: string;
  @Field(() => GraphQLISODateTime) createdAt: Date;
}

@ObjectType()
export class AdminUserSearchResult {
  @Field(() => [AdminUser]) users: AdminUser[];
  @Field(() => Int) total: number;
  @Field() hasMore: boolean;
}

@ObjectType()
export class AdminUserCount {
  @Field(() => Int) count: number;
}

@ObjectType()
export class AdminUserIds {
  @Field(() => [Int]) ids: number[];
}

@ObjectType()
export class AdminSystemStats {
  @Field(() => Int) users: number;
  @Field(() => Int) contacts: number;
  @Field(() => Int) invoices: number;
}

@ObjectType()
export class AdminPlanUpdate {
  @Field() message: string;
  @Field() plan: string;
}

@ObjectType()
export class AdminActivationFunnel {
  @Field(() => GraphQLISODateTime) asOf: Date;
  @Field(() => GraphQLISODateTime) cohortStartedAt: Date;
  @Field(() => Int) cohortDays: number;
  @Field(() => Int) organizationsCreated: number;
  @Field(() => Int) organizationsSent: number;
  @Field(() => Int) organizationsAdvanced: number;
  @Field(() => Int) organizationsReturned: number;
  @Field(() => Int) trialOrganizationsSent: number;
  @Field(() => Int) organizationsTrialToPaid: number;
  @Field(() => Float) sendRate: number;
  @Field(() => Float) advanceRate: number;
  @Field(() => Float) returnRate: number;
  @Field(() => Float) trialToPaidRate: number;
}

@ObjectType()
export class AdminProviderHealth {
  @Field() id: string;
  @Field() name: string;
  @Field() status: string;
  @Field() detail: string;
  @Field() required: boolean;
}

@ObjectType()
export class AdminJobQueueHealth {
  @Field() id: string;
  @Field() name: string;
  @Field() status: string;
  @Field() available: boolean;
  @Field(() => Int) queued: number;
  @Field(() => Int) processing: number;
  @Field(() => Int) retrying: number;
  @Field(() => Int) actionRequired: number;
  @Field(() => Int) active: number;
  @Field(() => GraphQLISODateTime, { nullable: true })
  oldestPendingAt: Date | null;
}

@ObjectType()
export class AdminOperationsSnapshot {
  @Field(() => GraphQLISODateTime) asOf: Date;
  @Field() status: string;
  @Field(() => Int) activeJobs: number;
  @Field(() => Int) retryingJobs: number;
  @Field(() => Int) actionRequiredJobs: number;
  @Field(() => [AdminProviderHealth]) providers: AdminProviderHealth[];
  @Field(() => [AdminJobQueueHealth]) queues: AdminJobQueueHealth[];
}
