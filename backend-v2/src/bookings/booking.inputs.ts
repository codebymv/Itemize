import { Field, GraphQLISODateTime, InputType, Int } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';
import { BookingStatus } from './booking.enums';

@InputType()
export class BookingFilterInput {
  @Field(() => Int, { nullable: true })
  calendarId?: number;

  @Field(() => Int, { nullable: true })
  contactId?: number;

  @Field(() => Int, { nullable: true })
  assignedToId?: number;

  @Field(() => BookingStatus, { nullable: true })
  status?: BookingStatus;

  @Field(() => GraphQLISODateTime, { nullable: true })
  startDate?: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  endDate?: Date;
}

@InputType()
export class CreateBookingInput {
  @Field(() => Int)
  calendarId: number;

  @Field(() => Int, { nullable: true })
  contactId?: number | null;

  @Field(() => String, { nullable: true })
  title?: string | null;

  @Field(() => GraphQLISODateTime)
  startTime: Date;

  @Field(() => GraphQLISODateTime)
  endTime: Date;

  @Field(() => String, { nullable: true })
  timezone?: string | null;

  @Field(() => String, { nullable: true })
  attendeeName?: string | null;

  @Field(() => String, { nullable: true })
  attendeeEmail?: string | null;

  @Field(() => String, { nullable: true })
  attendeePhone?: string | null;

  @Field(() => Int, { nullable: true })
  assignedToId?: number | null;

  @Field(() => String, { nullable: true })
  notes?: string | null;

  @Field(() => String, { nullable: true })
  internalNotes?: string | null;

  @Field(() => GraphQLJSON, { nullable: true })
  customFields?: Record<string, unknown> | null;
}

@InputType()
export class RescheduleBookingInput {
  @Field(() => GraphQLISODateTime)
  startTime: Date;

  @Field(() => GraphQLISODateTime)
  endTime: Date;

  @Field(() => String, { nullable: true })
  timezone?: string | null;
}
