import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class ReputationRequestFilterInput {
  @Field(() => String, { nullable: true })
  status?: string;
}
