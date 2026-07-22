import { Field, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class AdminUser {
  @Field(() => Int) id: number;
  @Field() email: string;
  @Field(() => String, { nullable: true }) name: string | null;
  @Field() role: string;
  @Field() plan: string;
  @Field(() => GraphQLISODateTime) createdAt: Date;
}

@ObjectType()
export class AdminUserSearchResult {
  @Field(() => [AdminUser]) users: AdminUser[];
  @Field(() => Int) total: number;
  @Field() hasMore: boolean;
}

@ObjectType()
export class AdminUserCount {
  @Field(() => Int) count: number;
}

@ObjectType()
export class AdminUserIds {
  @Field(() => [Int]) ids: number[];
}

@ObjectType()
export class AdminSystemStats {
  @Field(() => Int) users: number;
  @Field(() => Int) contacts: number;
  @Field(() => Int) invoices: number;
}

@ObjectType()
export class AdminPlanUpdate {
  @Field() message: string;
  @Field() plan: string;
}
