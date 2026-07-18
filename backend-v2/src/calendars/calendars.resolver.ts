import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { CreateCalendarInput, UpdateCalendarInput } from './calendar.inputs';
import { Calendar } from './calendar.types';
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
    return this.calendars.create(
      this.organizationId(),
      this.userId(),
      input,
    );
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

  private organizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization) throw new Error('Verified organization context is unavailable');
    return organization.organizationId;
  }

  private userId(): number {
    const identity = this.requestContext.current().identity;
    if (!identity) throw new Error('Verified identity context is unavailable');
    return identity.userId;
  }
}
