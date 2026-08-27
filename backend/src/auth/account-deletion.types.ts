import { Field, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class AccountDeletionBlockerPayload {
  @Field()
  reason: string;

  @Field(() => Int)
  organizationId: number;

  @Field()
  organizationName: string;
}

@ObjectType()
export class AccountDeletionPreflightPayload {
  @Field()
  eligible: boolean;

  @Field(() => Int)
  recoveryDays: number;

  @Field(() => Int)
  membershipCount: number;

  @Field(() => Int)
  ownedOrganizationCount: number;

  @Field(() => [AccountDeletionBlockerPayload])
  blockers: AccountDeletionBlockerPayload[];

  @Field(() => [String])
  retentionNotices: string[];

  @Field(() => GraphQLISODateTime, { nullable: true })
  scheduledAt?: Date;
}

@ObjectType()
export class AccountDeletionScheduledPayload {
  @Field()
  success: boolean;

  @Field()
  message: string;

  @Field()
  email: string;

  @Field(() => GraphQLISODateTime)
  scheduledAt: Date;

  @Field(() => Int)
  recoveryDays: number;
}
