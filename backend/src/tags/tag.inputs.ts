import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class CreateTagInput {
  @Field()
  name: string;

  @Field({ nullable: true })
  color?: string;
}

@InputType()
export class UpdateTagInput {
  @Field(() => String, { nullable: true })
  name?: string | null;

  @Field(() => String, { nullable: true })
  color?: string | null;
}
