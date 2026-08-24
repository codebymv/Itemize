import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';

@ObjectType()
export class CalendarConnection {
  @Field(() => Int)
  id: number;

  @Field()
  provider: string;

  @Field(() => String, { nullable: true })
  providerEmail: string | null;

  @Field()
  syncEnabled: boolean;

  @Field()
  syncDirection: string;

  @Field(() => GraphQLISODateTime, { nullable: true })
  lastSyncAt: Date | null;

  @Field()
  isActive: boolean;

  @Field(() => String, { nullable: true })
  errorMessage: string | null;

  @Field(() => Int)
  errorCount: number;

  @Field(() => [String])
  selectedCalendars: string[];

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;
}

@ObjectType()
export class CalendarSyncJob {
  @Field(() => ID)
  id: string;

  @Field(() => Int)
  connectionId: number;

  @Field()
  direction: string;

  @Field()
  status: string;

  @Field(() => Int)
  attemptCount: number;

  @Field(() => GraphQLISODateTime)
  nextAttemptAt: Date;

  @Field(() => GraphQLJSON, { nullable: true })
  result: Record<string, unknown> | null;

  @Field(() => String, { nullable: true })
  lastError: string | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  completedAt: Date | null;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;
}

@ObjectType()
export class CalendarSyncStats {
  @Field(() => Int)
  totalSynced: number;

  @Field(() => Int)
  pushed: number;

  @Field(() => Int)
  pulled: number;

  @Field(() => GraphQLISODateTime, { nullable: true })
  lastEventSync: Date | null;
}

@ObjectType()
export class CalendarSyncStatus {
  @Field(() => CalendarConnection)
  connection: CalendarConnection;

  @Field(() => CalendarSyncStats)
  stats: CalendarSyncStats;

  @Field(() => [CalendarSyncJob])
  jobs: CalendarSyncJob[];
}

@ObjectType()
export class CalendarSyncRequest {
  @Field()
  message: string;

  @Field()
  created: boolean;

  @Field(() => CalendarSyncJob)
  job: CalendarSyncJob;
}
