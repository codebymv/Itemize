import { Field, GraphQLISODateTime, InputType, Int } from '@nestjs/graphql';

@InputType()
export class ReputationRequestFilterInput {
  @Field(() => String, { nullable: true })
  status?: string;
}

@InputType()
export class SendReputationRequestInput {
  @Field()
  idempotencyKey: string;

  @Field(() => Int, { nullable: true })
  contactId?: number;

  @Field({ nullable: true })
  contactEmail?: string;

  @Field({ nullable: true })
  contactPhone?: string;

  @Field({ nullable: true })
  contactName?: string;

  @Field()
  channel: string;

  @Field({ nullable: true })
  customMessage?: string;

  @Field({ nullable: true })
  preferredPlatform?: string;

  @Field({ nullable: true })
  redirectUrl?: string;

  @Field(() => GraphQLISODateTime, { nullable: true })
  scheduledAt?: Date;
}

@InputType()
export class SendBulkReputationRequestsInput {
  @Field()
  idempotencyKey: string;

  @Field(() => [Int])
  contactIds: number[];

  @Field()
  channel: string;

  @Field({ nullable: true })
  customMessage?: string;

  @Field({ nullable: true })
  preferredPlatform?: string;
}
