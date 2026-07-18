import { Field, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class CalendarAvailabilityWindow {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  calendarId: number;

  @Field(() => Int)
  dayOfWeek: number;

  @Field()
  startTime: string;

  @Field()
  endTime: string;

  @Field()
  isActive: boolean;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;
}

@ObjectType()
export class CalendarDateOverride {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  calendarId: number;

  @Field()
  overrideDate: string;

  @Field()
  isAvailable: boolean;

  @Field(() => String, { nullable: true })
  startTime: string | null;

  @Field(() => String, { nullable: true })
  endTime: string | null;

  @Field(() => String, { nullable: true })
  reason: string | null;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;
}

@ObjectType()
export class Calendar {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  organizationId: number;

  @Field()
  name: string;

  @Field(() => String, { nullable: true })
  description: string | null;

  @Field()
  slug: string;

  @Field()
  timezone: string;

  @Field(() => Int)
  durationMinutes: number;

  @Field(() => Int)
  bufferBeforeMinutes: number;

  @Field(() => Int)
  bufferAfterMinutes: number;

  @Field(() => Int)
  minNoticeHours: number;

  @Field(() => Int)
  maxFutureDays: number;

  @Field(() => Int, { nullable: true })
  assignedToId: number | null;

  @Field(() => String, { nullable: true })
  assignedToName: string | null;

  @Field()
  assignmentMode: string;

  @Field()
  confirmationEmail: boolean;

  @Field()
  reminderEmail: boolean;

  @Field(() => Int)
  reminderHours: number;

  @Field()
  color: string;

  @Field()
  isActive: boolean;

  @Field(() => Int, { nullable: true })
  createdById: number | null;

  @Field(() => Int, { nullable: true })
  upcomingBookings: number | null;

  @Field(() => [CalendarAvailabilityWindow])
  availabilityWindows: CalendarAvailabilityWindow[];

  @Field(() => [CalendarDateOverride])
  dateOverrides: CalendarDateOverride[];

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;
}
