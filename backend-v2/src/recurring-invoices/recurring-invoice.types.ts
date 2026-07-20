import { Field, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';
import { PageInfo } from '../common/pagination';

@ObjectType()
export class RecurringInvoiceItem {
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
}

@ObjectType()
export class RecurringInvoice {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  organizationId: number;

  @Field()
  templateName: string;

  @Field(() => Int, { nullable: true })
  contactId: number | null;

  @Field(() => String, { nullable: true })
  customerName: string | null;

  @Field(() => String, { nullable: true })
  customerEmail: string | null;

  @Field()
  frequency: string;

  @Field()
  startDate: string;

  @Field(() => String, { nullable: true })
  endDate: string | null;

  @Field(() => String, { nullable: true })
  nextRunDate: string | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  lastGeneratedAt: Date | null;

  @Field()
  status: string;

  @Field(() => [RecurringInvoiceItem])
  items: RecurringInvoiceItem[];

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

  @Field(() => String, { nullable: true })
  notes: string | null;

  @Field(() => String, { nullable: true })
  paymentTerms: string | null;

  @Field(() => GraphQLJSON)
  customFields: Record<string, unknown>;

  @Field(() => Int, { nullable: true })
  sourceInvoiceId: number | null;

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

  @Field(() => String, { nullable: true })
  sourceInvoiceNumber: string | null;

  @Field(() => Int)
  invoicesGenerated: number;
}

@ObjectType()
export class RecurringInvoicePage {
  @Field(() => [RecurringInvoice])
  nodes: RecurringInvoice[];

  @Field(() => PageInfo)
  pageInfo: PageInfo;
}

@ObjectType()
export class RecurringInvoiceHistoryEntry {
  @Field(() => Int)
  id: number;

  @Field()
  invoiceNumber: string;

  @Field()
  total: string;

  @Field()
  status: string;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;
}

@ObjectType()
export class RecurringInvoiceHistoryPage {
  @Field(() => [RecurringInvoiceHistoryEntry])
  nodes: RecurringInvoiceHistoryEntry[];

  @Field(() => PageInfo)
  pageInfo: PageInfo;
}

@ObjectType()
export class RecurringInvoiceGenerationResult {
  @Field(() => Int)
  invoiceId: number;

  @Field()
  invoiceNumber: string;

  @Field(() => String, { nullable: true })
  nextRunDate: string | null;

  @Field()
  templateStatus: string;

  @Field()
  replayed: boolean;
}

@ObjectType()
export class DeleteRecurringInvoiceResult {
  @Field()
  success: boolean;

  @Field(() => Int)
  deletedId: number;

  @Field()
  templateName: string;
}
