import { Field, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';
import { PageInfo } from '../common/pagination';

@ObjectType()
export class InvoiceItem {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  organizationId: number;

  @Field(() => Int)
  invoiceId: number;

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
}

@ObjectType()
export class InvoiceBusinessSummary {
  @Field(() => Int)
  id: number;

  @Field()
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
}

@ObjectType()
export class InvoicePaymentSummary {
  @Field(() => Int)
  id: number;

  @Field()
  amount: string;

  @Field()
  currency: string;

  @Field()
  paymentMethod: string;

  @Field()
  status: string;

  @Field(() => String, { nullable: true })
  notes: string | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  paidAt: Date | null;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;
}

@ObjectType()
export class Invoice {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  organizationId: number;

  @Field()
  invoiceNumber: string;

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
  dueDate: string;

  @Field()
  subtotal: string;

  @Field()
  taxRate: string;

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
  amountPaid: string;

  @Field()
  amountDue: string;

  @Field()
  currency: string;

  @Field()
  status: string;

  @Field(() => String, { nullable: true })
  paymentTerms: string | null;

  @Field(() => String, { nullable: true })
  paymentInstructions: string | null;

  @Field(() => String, { nullable: true })
  notes: string | null;

  @Field(() => String, { nullable: true })
  termsAndConditions: string | null;

  @Field(() => String, { nullable: true })
  stripeInvoiceId: string | null;

  @Field(() => String, { nullable: true })
  stripePaymentIntentId: string | null;

  @Field(() => String, { nullable: true })
  stripeHostedInvoiceUrl: string | null;

  @Field(() => String, { nullable: true })
  stripePdfUrl: string | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  sentAt: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  viewedAt: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  paidAt: Date | null;

  @Field()
  isRecurring: boolean;

  @Field(() => String, { nullable: true })
  recurringInterval: string | null;

  @Field(() => Int, { nullable: true })
  parentInvoiceId: number | null;

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

  @Field(() => [InvoiceItem])
  items: InvoiceItem[];

  @Field(() => [InvoicePaymentSummary])
  payments: InvoicePaymentSummary[];

  @Field(() => InvoiceBusinessSummary, { nullable: true })
  business: InvoiceBusinessSummary | null;
}

@ObjectType()
export class InvoicePage {
  @Field(() => [Invoice])
  nodes: Invoice[];

  @Field(() => PageInfo)
  pageInfo: PageInfo;
}

@ObjectType()
export class DeleteInvoiceResult {
  @Field()
  success: boolean;

  @Field(() => Int)
  deletedId: number;

  @Field()
  invoiceNumber: string;
}

@ObjectType()
export class InvoiceEmailPreview {
  @Field()
  html: string;
}
