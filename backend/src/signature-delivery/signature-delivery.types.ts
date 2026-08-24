import { Field, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class SignatureEmailPreview {
  @Field() html: string;
  @Field() subject: string;
}

@ObjectType()
export class SignatureReminderSchedule {
  @Field(() => GraphQLISODateTime) scheduledAt: Date;
  @Field(() => Int) reminderCount: number;
}
