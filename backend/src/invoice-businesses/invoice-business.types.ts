import { Field, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';
import { PageInfo } from '../common/pagination';

@ObjectType()
export class InvoiceBusiness {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  organizationId: number;

  @Field(() => String)
  name: string;

  @Field(() => String, { nullable: true })
  email: string | null;

  @Field(() => String, { nullable: true })
  phone: string | null;

  @Field(() => String, { nullable: true })
  address: string | null;

  @Field(() => String, { nullable: true })
  taxId: string | null;

  @Field(() => String, { nullable: true })
  logoUrl: string | null;

  @Field(() => Boolean)
  isActive: boolean;

  @Field(() => GraphQLISODateTime, { nullable: true })
  lastUsedAt: Date | null;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;
}

@ObjectType()
export class InvoiceBusinessPage {
  @Field(() => [InvoiceBusiness])
  nodes: InvoiceBusiness[];

  @Field(() => PageInfo)
  pageInfo: PageInfo;
}

@ObjectType()
export class DeleteInvoiceBusinessResult {
  @Field(() => Int)
  deletedId: number;

  @Field(() => Boolean)
  success: boolean;
}
