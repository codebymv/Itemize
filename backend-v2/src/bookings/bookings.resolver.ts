import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { OrganizationScoped } from '../common/metadata';
import { PageInput } from '../common/pagination';
import { RequestContextService } from '../request-context/request-context.service';
import { BookingFilterInput } from './booking.inputs';
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

  private organizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization)
      throw new Error('Verified organization context is unavailable');
    return organization.organizationId;
  }
}
