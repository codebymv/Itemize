import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { NotificationPage } from './notification.types';
import { NotificationsService } from './notifications.service';

@Resolver()
export class NotificationsResolver {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly requestContext: RequestContextService,
  ) {}

  @OrganizationScoped()
  @Query(() => NotificationPage)
  notificationsCenter(
    @Args('first', { type: () => Int, defaultValue: 25 }) first: number,
    @Args('after', { type: () => String, nullable: true }) after?: string,
    @Args('unreadOnly', { defaultValue: false }) unreadOnly?: boolean,
  ): Promise<NotificationPage> {
    return this.notifications.list({
      organizationId: this.organizationId(),
      userId: this.userId(),
      first,
      after,
      unreadOnly,
    });
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Int)
  markNotificationsSeen(): Promise<number> {
    return this.notifications.markSeen(this.organizationId(), this.userId());
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Boolean)
  markNotificationRead(
    @Args('notificationId', { type: () => ID }) notificationId: string,
  ): Promise<boolean> {
    return this.notifications.markRead(
      this.organizationId(),
      this.userId(),
      notificationId,
    );
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Int)
  markAllNotificationsRead(): Promise<number> {
    return this.notifications.markAllRead(
      this.organizationId(),
      this.userId(),
    );
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
