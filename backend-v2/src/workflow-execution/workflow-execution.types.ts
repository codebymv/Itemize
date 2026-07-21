import { Field, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';
import { PageInfo } from '../common/pagination';

@ObjectType()
export class WorkflowSideEffectStatusCounts {
  @Field(() => Int) queued: number;
  @Field(() => Int) processing: number;
  @Field(() => Int) retry: number;
  @Field(() => Int) sent: number;
  @Field(() => Int) deadLetter: number;
  @Field(() => Int) cancelled: number;
  @Field(() => Int) reconciliationRequired: number;
}

@ObjectType()
export class WorkflowSideEffectTypeCounts {
  @Field(() => Int) email: number;
  @Field(() => Int) sms: number;
  @Field(() => Int) webhook: number;
}

@ObjectType()
export class WorkflowSideEffectSummary {
  @Field(() => Int) total: number;
  @Field(() => WorkflowSideEffectStatusCounts) byStatus: WorkflowSideEffectStatusCounts;
  @Field(() => WorkflowSideEffectTypeCounts) byType: WorkflowSideEffectTypeCounts;
  @Field(() => Int) dueCount: number;
  @Field(() => Int) expiredProcessingCount: number;
  @Field(() => Int) maxAttemptCount: number;
  @Field(() => Int) totalAttemptCount: number;
  @Field(() => Int) operatorRetryCount: number;
  @Field(() => GraphQLISODateTime, { nullable: true }) oldestPendingAt: Date | null;
  @Field(() => Int, { nullable: true }) oldestPendingAgeSeconds: number | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) lastOperatorRetryAt: Date | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) latestDeadLetterAt: Date | null;
}

@ObjectType()
export class WorkflowEnrollmentExecutionSummary {
  @Field(() => Int) total: number;
  @Field(() => Int) active: number;
  @Field(() => Int) paused: number;
  @Field(() => Int) completed: number;
  @Field(() => Int) failed: number;
  @Field(() => Int) cancelled: number;
  @Field(() => GraphQLISODateTime, { nullable: true }) oldestDueAt: Date | null;
  @Field(() => Int, { nullable: true }) oldestDueAgeSeconds: number | null;
}

@ObjectType()
export class WorkflowExecutionSummary {
  @Field(() => Int) workflowId: number;
  @Field(() => WorkflowSideEffectSummary) sideEffects: WorkflowSideEffectSummary;
  @Field(() => WorkflowEnrollmentExecutionSummary) enrollments: WorkflowEnrollmentExecutionSummary;
}

@ObjectType()
export class WorkflowSideEffect {
  @Field(() => Int) id: number;
  @Field(() => Int, { nullable: true }) enrollmentId: number | null;
  @Field(() => Int, { nullable: true }) stepId: number | null;
  @Field(() => Int, { nullable: true }) stepOrder: number | null;
  @Field(() => String, { nullable: true }) stepType: string | null;
  @Field(() => String) effectType: string;
  @Field(() => String) status: string;
  @Field(() => Int) attemptCount: number;
  @Field(() => Int) operatorRetryCount: number;
  @Field(() => String, { nullable: true }) providerId: string | null;
  @Field(() => String, { nullable: true }) lastError: string | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) nextAttemptAt: Date | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) leaseExpiresAt: Date | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) cancelledAt: Date | null;
  @Field(() => String, { nullable: true }) cancellationReason: string | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) lastOperatorRetryAt: Date | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) reconciliationRequiredAt: Date | null;
  @Field(() => String, { nullable: true }) reconciliationReason: string | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) lastReconciledAt: Date | null;
  @Field(() => String, { nullable: true }) lastReconciliationAction: string | null;
  @Field(() => Int, { nullable: true }) lastReconciledBy: number | null;
  @Field(() => GraphQLISODateTime) createdAt: Date;
  @Field(() => GraphQLISODateTime, { nullable: true }) sentAt: Date | null;
  @Field(() => Boolean) isDue: boolean;
  @Field(() => Boolean) leaseExpired: boolean;
  @Field(() => Int) ageSeconds: number;
  @Field(() => String, { nullable: true }) enrollmentStatus: string | null;
  @Field(() => Int, { nullable: true }) enrollmentCurrentStep: number | null;
  @Field(() => Int, { nullable: true }) contactId: number | null;
  @Field(() => String, { nullable: true }) contactName: string | null;
}

@ObjectType()
export class WorkflowSideEffectPage {
  @Field(() => [WorkflowSideEffect]) nodes: WorkflowSideEffect[];
  @Field(() => PageInfo) pageInfo: PageInfo;
}
