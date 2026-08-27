import { Field, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';

@ObjectType()
export class AccountDataExport {
  @Field(() => Int)
  schemaVersion: number;

  @Field(() => GraphQLISODateTime)
  generatedAt: Date;

  @Field()
  filename: string;

  @Field(() => GraphQLJSON)
  data: Record<string, unknown>;
}
