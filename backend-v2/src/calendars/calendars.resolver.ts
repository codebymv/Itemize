import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import {
  CalendarAvailabilityWindowInput,
  CalendarDateOverrideInput,
  CreateCalendarInput,
  UpdateCalendarInput,
} from './calendar.inputs';
import {
  Calendar,
  CalendarAvailabilityWindow,
  CalendarDateOverride,
} from './calendar.types';
import { CalendarsService } from './calendars.service';

@Resolver(() => Calendar)
export class CalendarsResolver {
  constructor(
    private readonly calendars: CalendarsService,
    private readonly requestContext: RequestContextService,
  ) {}

  @OrganizationScoped()
  @Query(() => [Calendar], { name: 'calendars' })
  calendarsList(): Promise<Calendar[]> {
    return this.calendars.list(this.organizationId());
  }

  @OrganizationScoped()
  @Query(() => Calendar)
  calendar(@Args('id', { type: () => Int }) id: number): Promise<Calendar> {
    return this.calendars.get(this.organizationId(), id);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Calendar)
  createCalendar(@Args('input') input: CreateCalendarInput): Promise<Calendar> {
    return this.calendars.create(this.organizationId(), this.userId(), input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Calendar)
  updateCalendar(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: UpdateCalendarInput,
  ): Promise<Calendar> {
    return this.calendars.update(this.organizationId(), id, input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Boolean)
  deleteCalendar(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<boolean> {
    return this.calendars.delete(this.organizationId(), id);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => [CalendarAvailabilityWindow])
  replaceCalendarAvailability(
    @Args('calendarId', { type: () => Int }) calendarId: number,
    @Args('windows', { type: () => [CalendarAvailabilityWindowInput] })
    windows: CalendarAvailabilityWindowInput[],
  ): Promise<CalendarAvailabilityWindow[]> {
    return this.calendars.replaceAvailability(
      this.organizationId(),
      calendarId,
      windows,
    );
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => CalendarDateOverride)
  upsertCalendarDateOverride(
    @Args('calendarId', { type: () => Int }) calendarId: number,
    @Args('input') input: CalendarDateOverrideInput,
  ): Promise<CalendarDateOverride> {
    return this.calendars.upsertDateOverride(
      this.organizationId(),
      calendarId,
      input,
    );
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Boolean)
  deleteCalendarDateOverride(
    @Args('calendarId', { type: () => Int }) calendarId: number,
    @Args('overrideId', { type: () => Int }) overrideId: number,
  ): Promise<boolean> {
    return this.calendars.deleteDateOverride(
      this.organizationId(),
      calendarId,
      overrideId,
    );
  }

  private organizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization)
      throw new Error('Verified organization context is unavailable');
    return organization.organizationId;
  }

  private userId(): number {
    const identity = this.requestContext.current().identity;
    if (!identity) throw new Error('Verified identity context is unavailable');
    return identity.userId;
  }
}
