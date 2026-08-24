import { Field, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class Tag {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  organizationId: number;

  @Field()
  name: string;

  @Field()
  color: string;

  @Field(() => Int)
  contactCount: number;

  @Field(() => Int)
  dealCount: number;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;
}

@ObjectType()
export class DeleteTagResult {
  @Field(() => Int)
  deletedId: number;
}
