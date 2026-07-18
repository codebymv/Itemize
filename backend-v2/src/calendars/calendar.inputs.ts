import { Field, InputType, Int } from '@nestjs/graphql';

@InputType()
export class CalendarAvailabilityWindowInput {
  @Field(() => Int)
  dayOfWeek: number;

  @Field()
  startTime: string;

  @Field()
  endTime: string;

  @Field(() => Boolean, { nullable: true })
  isActive?: boolean;
}

@InputType()
export class CreateCalendarInput {
  @Field()
  name: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => String, { nullable: true })
  timezone?: string;

  @Field(() => Int, { nullable: true })
  durationMinutes?: number;

  @Field(() => Int, { nullable: true })
  bufferBeforeMinutes?: number;

  @Field(() => Int, { nullable: true })
  bufferAfterMinutes?: number;

  @Field(() => Int, { nullable: true })
  minNoticeHours?: number;

  @Field(() => Int, { nullable: true })
  maxFutureDays?: number;

  @Field(() => Int, { nullable: true })
  assignedToId?: number | null;

  @Field(() => String, { nullable: true })
  assignmentMode?: string;

  @Field(() => Boolean, { nullable: true })
  confirmationEmail?: boolean;

  @Field(() => Boolean, { nullable: true })
  reminderEmail?: boolean;

  @Field(() => Int, { nullable: true })
  reminderHours?: number;

  @Field(() => String, { nullable: true })
  color?: string;

  @Field(() => Boolean, { nullable: true })
  isActive?: boolean;

  @Field(() => [CalendarAvailabilityWindowInput], { nullable: true })
  availabilityWindows?: CalendarAvailabilityWindowInput[] | null;
}

@InputType()
export class UpdateCalendarInput {
  @Field(() => String, { nullable: true })
  name?: string | null;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => String, { nullable: true })
  timezone?: string | null;

  @Field(() => Int, { nullable: true })
  durationMinutes?: number | null;

  @Field(() => Int, { nullable: true })
  bufferBeforeMinutes?: number | null;

  @Field(() => Int, { nullable: true })
  bufferAfterMinutes?: number | null;

  @Field(() => Int, { nullable: true })
  minNoticeHours?: number | null;

  @Field(() => Int, { nullable: true })
  maxFutureDays?: number | null;

  @Field(() => Int, { nullable: true })
  assignedToId?: number | null;

  @Field(() => String, { nullable: true })
  assignmentMode?: string | null;

  @Field(() => Boolean, { nullable: true })
  confirmationEmail?: boolean | null;

  @Field(() => Boolean, { nullable: true })
  reminderEmail?: boolean | null;

  @Field(() => Int, { nullable: true })
  reminderHours?: number | null;

  @Field(() => String, { nullable: true })
  color?: string | null;

  @Field(() => Boolean, { nullable: true })
  isActive?: boolean | null;
}
