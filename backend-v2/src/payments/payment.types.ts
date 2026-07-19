import {
  Field,
  GraphQLISODateTime,
  Int,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import { PageInfo } from '../common/pagination';

export enum PaymentMethod {
  CARD = 'card',
  STRIPE = 'stripe',
  BANK_TRANSFER = 'bank_transfer',
  CASH = 'cash',
  CHECK = 'check',
  OTHER = 'other',
}

export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled',
}

registerEnumType(PaymentMethod, { name: 'PaymentMethod' });
registerEnumType(PaymentStatus, { name: 'PaymentStatus' });

@ObjectType()
export class Payment {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  organizationId: number;

  @Field(() => Int, { nullable: true })
  invoiceId: number | null;

  @Field(() => String, { nullable: true })
  invoiceNumber: string | null;

  @Field(() => Int, { nullable: true })
  contactId: number | null;

  @Field(() => String, { nullable: true })
  contactName: string | null;

  @Field(() => String)
  amount: string;

  @Field(() => String)
  currency: string;

  @Field(() => PaymentMethod)
  paymentMethod: PaymentMethod;

  @Field(() => PaymentStatus)
  status: PaymentStatus;

  @Field(() => String, { nullable: true })
  stripePaymentIntentId: string | null;

  @Field(() => String, { nullable: true })
  cardLast4: string | null;

  @Field(() => String, { nullable: true })
  cardBrand: string | null;

  @Field(() => String, { nullable: true })
  description: string | null;

  @Field(() => String, { nullable: true })
  notes: string | null;

  @Field(() => String, { nullable: true })
  receiptUrl: string | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  paidAt: Date | null;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;
}

@ObjectType()
export class PaymentPage {
  @Field(() => [Payment])
  nodes: Payment[];

  @Field(() => PageInfo)
  pageInfo: PageInfo;
}

@ObjectType()
export class InvoicePaymentBalance {
  @Field(() => String)
  amountPaid: string;

  @Field(() => String)
  amountDue: string;

  @Field(() => String)
  status: string;
}

@ObjectType()
export class RecordPaymentResult {
  @Field(() => Payment)
  payment: Payment;

  @Field(() => InvoicePaymentBalance, { nullable: true })
  invoice: InvoicePaymentBalance | null;
}
