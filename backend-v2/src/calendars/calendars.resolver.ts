import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { OrganizationScoped } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
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

  private organizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization) throw new Error('Verified organization context is unavailable');
    return organization.organizationId;
  }
}
