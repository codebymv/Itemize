import { Field, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class GetStartedStep {
  @Field()
  id: string;

  @Field()
  completed: boolean;

  @Field(() => GraphQLISODateTime, { nullable: true })
  completedAt: Date | null;

  @Field()
  href: string;
}

@ObjectType()
export class GetStartedProgress {
  @Field()
  dismissed: boolean;

  @Field(() => Int)
  completedCount: number;

  @Field(() => Int)
  totalCount: number;

  @Field(() => [GetStartedStep])
  steps: GetStartedStep[];
}
