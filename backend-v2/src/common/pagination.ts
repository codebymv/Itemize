import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';

@InputType()
export class PageInput {
  @Field(() => Int, { defaultValue: 1 })
  page = 1;

  @Field(() => Int, { defaultValue: 50 })
  pageSize = 50;
}

@ObjectType()
export class PageInfo {
  @Field(() => Int)
  page: number;

  @Field(() => Int)
  pageSize: number;

  @Field(() => Int)
  total: number;

  @Field(() => Int)
  totalPages: number;

  @Field()
  hasNextPage: boolean;

  @Field()
  hasPreviousPage: boolean;
}

export type NormalizedPage = {
  page: number;
  pageSize: number;
  offset: number;
};

export const pageInfo = (
  page: number,
  pageSize: number,
  total: number,
): PageInfo => {
  const totalPages = Math.ceil(total / pageSize);
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
};
