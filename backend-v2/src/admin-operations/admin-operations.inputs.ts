import { Field, InputType, Int } from '@nestjs/graphql';

@InputType()
export class AdminUserSearchInput {
  @Field({ nullable: true }) query?: string;
  @Field(() => Int, { nullable: true }) page?: number;
  @Field(() => Int, { nullable: true }) limit?: number;
  @Field({ nullable: true }) plan?: string;
}

@InputType()
export class AdminUserIdsInput {
  @Field({ nullable: true }) query?: string;
  @Field({ nullable: true }) plan?: string;
}
