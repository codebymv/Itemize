import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class CreateCategoryInput {
  @Field()
  name: string;

  @Field({ nullable: true })
  colorValue?: string;
}

@InputType()
export class UpdateCategoryInput {
  @Field(() => String, { nullable: true })
  name?: string | null;

  @Field(() => String, { nullable: true })
  colorValue?: string | null;
}
