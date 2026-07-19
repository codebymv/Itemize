import { Field, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';
import { PageInfo } from '../common/pagination';

@ObjectType()
export class EstimateItem {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  estimateId: number;

  @Field(() => Int)
  organizationId: number;

  @Field(() => Int, { nullable: true })
  productId: number | null;

  @Field()
  name: string;

  @Field(() => String, { nullable: true })
  description: string | null;

  @Field()
  quantity: string;

  @Field()
  unitPrice: string;

  @Field()
  taxRate: string;

  @Field()
  taxAmount: string;

  @Field()
  discountAmount: string;

  @Field()
  total: string;

  @Field(() => Int)
  sortOrder: number;

  @Field(() => String, { nullable: true })
  productName: string | null;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;
}

@ObjectType()
export class Estimate {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  organizationId: number;

  @Field()
  estimateNumber: string;

  @Field(() => Int, { nullable: true })
  contactId: number | null;

  @Field(() => Int, { nullable: true })
  businessId: number | null;

  @Field(() => String, { nullable: true })
  customerName: string | null;

  @Field(() => String, { nullable: true })
  customerEmail: string | null;

  @Field(() => String, { nullable: true })
  customerPhone: string | null;

  @Field(() => String, { nullable: true })
  customerAddress: string | null;

  @Field()
  issueDate: string;

  @Field()
  validUntil: string;

  @Field()
  subtotal: string;

  @Field()
  taxAmount: string;

  @Field()
  discountAmount: string;

  @Field(() => String, { nullable: true })
  discountType: string | null;

  @Field()
  discountValue: string;

  @Field()
  total: string;

  @Field()
  currency: string;

  @Field()
  status: string;

  @Field(() => String, { nullable: true })
  notes: string | null;

  @Field(() => String, { nullable: true })
  termsAndConditions: string | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  sentAt: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  viewedAt: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  acceptedAt: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  declinedAt: Date | null;

  @Field(() => Int, { nullable: true })
  convertedInvoiceId: number | null;

  @Field(() => GraphQLJSON)
  customFields: Record<string, unknown>;

  @Field(() => Int, { nullable: true })
  createdById: number | null;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;

  @Field(() => String, { nullable: true })
  contactFirstName: string | null;

  @Field(() => String, { nullable: true })
  contactLastName: string | null;

  @Field(() => String, { nullable: true })
  contactEmail: string | null;

  @Field(() => [EstimateItem])
  items: EstimateItem[];
}

@ObjectType()
export class EstimatePage {
  @Field(() => [Estimate])
  nodes: Estimate[];

  @Field(() => PageInfo)
  pageInfo: PageInfo;
}

@ObjectType()
export class DeleteEstimateResult {
  @Field()
  success: boolean;

  @Field(() => Int)
  deletedId: number;

  @Field()
  estimateNumber: string;
}
