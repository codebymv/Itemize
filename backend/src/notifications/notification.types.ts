import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { GraphQLISODateTime } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';

@ObjectType()
export class UserNotification {
  @Field(() => ID)
  id: string;

  @Field()
  eventType: string;

  @Field()
  category: string;

  @Field()
  priority: string;

  @Field()
  title: string;

  @Field()
  body: string;

  @Field(() => String, { nullable: true })
  href: string | null;

  @Field(() => String, { nullable: true })
  entityType: string | null;

  @Field(() => ID, { nullable: true })
  entityId: string | null;

  @Field(() => GraphQLJSON)
  payload: Record<string, unknown>;

  @Field(() => GraphQLISODateTime)
  occurredAt: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  seenAt: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  readAt: Date | null;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;
}

@ObjectType()
export class NotificationPageInfo {
  @Field(() => String, { nullable: true })
  endCursor: string | null;

  @Field()
  hasNextPage: boolean;
}

@ObjectType()
export class NotificationPage {
  @Field(() => [UserNotification])
  nodes: UserNotification[];

  @Field(() => NotificationPageInfo)
  pageInfo: NotificationPageInfo;

  @Field(() => Int)
  unreadCount: number;

  @Field(() => Int)
  unseenCount: number;
}
