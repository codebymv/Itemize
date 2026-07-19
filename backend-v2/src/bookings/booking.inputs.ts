import { Field, GraphQLISODateTime, InputType, Int } from '@nestjs/graphql';
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
