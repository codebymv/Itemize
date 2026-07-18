import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class MarkOnboardingSeenInput {
  @Field()
  featureKey: string;

  @Field({ defaultValue: '1.0' })
  version?: string;
}
