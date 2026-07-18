import { Field, InputType, Int } from '@nestjs/graphql';

@InputType()
export class WorkspaceContentFilterInput {
  @Field(() => String, { nullable: true })
  search?: string;

  @Field(() => Int, { nullable: true })
  categoryId?: number;
}
