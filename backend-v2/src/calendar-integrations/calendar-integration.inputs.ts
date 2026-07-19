import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class UpdateCalendarConnectionInput {
  @Field(() => Boolean, { nullable: true })
  syncEnabled?: boolean | null;

  @Field(() => String, { nullable: true })
  syncDirection?: string | null;

  @Field(() => [String], { nullable: true })
  selectedCalendars?: string[] | null;
}
