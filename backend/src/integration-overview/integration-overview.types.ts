import { Field, Int, ObjectType } from '@nestjs/graphql';
import { CalendarConnection } from '../calendar-integrations/calendar-integration.types';

@ObjectType()
export class IntegrationOverviewFacebookChannel {
  @Field(() => Int)
  id: number;

  @Field()
  name: string;
}

@ObjectType()
export class IntegrationOverview {
  @Field(() => [CalendarConnection])
  calendarConnections: CalendarConnection[];

  @Field(() => IntegrationOverviewFacebookChannel, { nullable: true })
  facebookChannel: IntegrationOverviewFacebookChannel | null;

  @Field()
  facebookStatusAvailable: boolean;

  @Field()
  stripeConnected: boolean;

  @Field()
  stripeStatusAvailable: boolean;
}
