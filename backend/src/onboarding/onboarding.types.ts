import { Field, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class OnboardingFeatureProgress {
  @Field()
  featureKey: string;

  @Field()
  seen: boolean;

  @Field(() => GraphQLISODateTime, { nullable: true })
  timestamp: Date | null;

  @Field(() => String, { nullable: true })
  version: string | null;

  @Field()
  dismissed: boolean;

  @Field(() => Int, { nullable: true })
  stepCompleted: number | null;
}
