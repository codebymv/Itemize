import { Field, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';
import { PageInfo } from '../common/pagination';
import { BookingStatus } from './booking.enums';

@ObjectType()
export class Booking {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  organizationId: number;

  @Field(() => Int)
  calendarId: number;

  @Field(() => Int, { nullable: true })
  contactId: number | null;

  @Field(() => String, { nullable: true })
  title: string | null;

  @Field(() => GraphQLISODateTime)
  startTime: Date;

  @Field(() => GraphQLISODateTime)
  endTime: Date;

  @Field()
  timezone: string;

  @Field(() => String, { nullable: true })
  attendeeName: string | null;

  @Field(() => String, { nullable: true })
  attendeeEmail: string | null;

  @Field(() => String, { nullable: true })
  attendeePhone: string | null;

  @Field(() => Int, { nullable: true })
  assignedToId: number | null;

  @Field(() => String, { nullable: true })
  assignedToName: string | null;

  @Field(() => BookingStatus)
  status: BookingStatus;

  @Field(() => GraphQLISODateTime, { nullable: true })
  cancelledAt: Date | null;

  @Field(() => String, { nullable: true })
  cancellationReason: string | null;

  @Field(() => String, { nullable: true })
  notes: string | null;

  @Field(() => String, { nullable: true })
  internalNotes: string | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  reminderSentAt: Date | null;

  @Field(() => GraphQLJSON)
  customFields: Record<string, unknown>;

  @Field()
  source: string;

  @Field(() => String, { nullable: true })
  calendarName: string | null;

  @Field(() => String, { nullable: true })
  calendarColor: string | null;

  @Field(() => String, { nullable: true })
  calendarSlug: string | null;

  @Field(() => String, { nullable: true })
  contactFirstName: string | null;

  @Field(() => String, { nullable: true })
  contactLastName: string | null;

  @Field(() => String, { nullable: true })
  contactEmail: string | null;

  @Field(() => String, { nullable: true })
  contactPhone: string | null;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;
}

@ObjectType()
export class BookingPage {
  @Field(() => [Booking])
  nodes: Booking[];

  @Field(() => PageInfo)
  pageInfo: PageInfo;
}
