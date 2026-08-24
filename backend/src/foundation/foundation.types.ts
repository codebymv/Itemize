import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class ViewerContext {
  @Field(() => Int)
  userId: number;

  @Field(() => Int)
  organizationId: number;

  @Field()
  organizationRole: string;

  @Field()
  requestId: string;
}
