import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { UpdateCalendarConnectionInput } from './calendar-integration.inputs';
import {
  CalendarConnection,
  CalendarSyncRequest,
  CalendarSyncStatus,
} from './calendar-integration.types';
import { CalendarIntegrationsService } from './calendar-integrations.service';

@Resolver(() => CalendarConnection)
export class CalendarIntegrationsResolver {
  constructor(
    private readonly calendarIntegrations: CalendarIntegrationsService,
    private readonly requestContext: RequestContextService,
  ) {}

  @OrganizationScoped()
  @Query(() => [CalendarConnection])
  calendarConnections(): Promise<CalendarConnection[]> {
    return this.calendarIntegrations.list(
      this.organizationId(),
      this.userId(),
    );
  }

  @OrganizationScoped()
  @Query(() => CalendarSyncStatus)
  calendarSyncStatus(
    @Args('connectionId', { type: () => Int }) connectionId: number,
  ): Promise<CalendarSyncStatus> {
    return this.calendarIntegrations.status(
      this.organizationId(),
      this.userId(),
      connectionId,
    );
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => CalendarConnection)
  updateCalendarConnection(
    @Args('connectionId', { type: () => Int }) connectionId: number,
    @Args('input') input: UpdateCalendarConnectionInput,
  ): Promise<CalendarConnection> {
    return this.calendarIntegrations.update(
      this.organizationId(),
      this.userId(),
      connectionId,
      input,
    );
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Boolean)
  disconnectCalendar(
    @Args('connectionId', { type: () => Int }) connectionId: number,
  ): Promise<boolean> {
    return this.calendarIntegrations.delete(
      this.organizationId(),
      this.userId(),
      connectionId,
    );
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => CalendarSyncRequest)
  requestCalendarSync(
    @Args('connectionId', { type: () => Int }) connectionId: number,
    @Args('idempotencyKey', { type: () => String, nullable: true })
    idempotencyKey?: string | null,
  ): Promise<CalendarSyncRequest> {
    return this.calendarIntegrations.enqueue(
      this.organizationId(),
      this.userId(),
      connectionId,
      idempotencyKey,
    );
  }

  private organizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization) {
      throw new Error('Verified organization context is unavailable');
    }
    return organization.organizationId;
  }

  private userId(): number {
    const identity = this.requestContext.current().identity;
    if (!identity) throw new Error('Verified identity context is unavailable');
    return identity.userId;
  }
}
