import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { PageInput } from '../common/pagination';
import { RequestContextService } from '../request-context/request-context.service';
import {
  BookingFilterInput,
  CreateBookingInput,
  RescheduleBookingInput,
} from './booking.inputs';
import { Booking, BookingPage } from './booking.types';
import { BookingsService } from './bookings.service';

@Resolver(() => Booking)
export class BookingsResolver {
  constructor(
    private readonly bookings: BookingsService,
    private readonly requestContext: RequestContextService,
  ) {}

  @OrganizationScoped()
  @Query(() => BookingPage, { name: 'bookings' })
  bookingsList(
    @Args('filter', { nullable: true }) filter?: BookingFilterInput,
    @Args('page', { nullable: true }) page?: PageInput,
  ): Promise<BookingPage> {
    return this.bookings.list(this.organizationId(), filter, page);
  }

  @OrganizationScoped()
  @Query(() => Booking)
  booking(@Args('id', { type: () => Int }) id: number): Promise<Booking> {
    return this.bookings.get(this.organizationId(), id);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Booking)
  createBooking(
    @Args('input') input: CreateBookingInput,
  ): Promise<Booking> {
    return this.bookings.create(this.organizationId(), input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Booking)
  cancelBooking(
    @Args('id', { type: () => Int }) id: number,
    @Args('reason', { type: () => String, nullable: true })
    reason?: string,
  ): Promise<Booking> {
    return this.bookings.cancel(this.organizationId(), id, reason);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Booking)
  rescheduleBooking(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: RescheduleBookingInput,
  ): Promise<Booking> {
    return this.bookings.reschedule(this.organizationId(), id, input);
  }

  private organizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization)
      throw new Error('Verified organization context is unavailable');
    return organization.organizationId;
  }
}
