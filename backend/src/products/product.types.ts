import { Field, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';
import { PageInfo } from '../common/pagination';

@ObjectType()
export class Product {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  organizationId: number;

  @Field()
  name: string;

  @Field(() => String, { nullable: true })
  description: string | null;

  @Field(() => String, { nullable: true })
  sku: string | null;

  @Field()
  price: string;

  @Field()
  currency: string;

  @Field()
  productType: string;

  @Field(() => String, { nullable: true })
  billingPeriod: string | null;

  @Field()
  taxRate: string;

  @Field()
  taxable: boolean;

  @Field()
  isActive: boolean;

  @Field(() => Int, { nullable: true })
  createdById: number | null;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;
}

@ObjectType()
export class ProductPage {
  @Field(() => [Product])
  nodes: Product[];

  @Field(() => PageInfo)
  pageInfo: PageInfo;
}

@ObjectType()
export class DeleteProductResult {
  @Field(() => Int)
  deletedId: number;

  @Field()
  success: boolean;
}
