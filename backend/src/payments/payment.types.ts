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

export enum PaymentPeriod {
  LAST_7_DAYS = '7days',
  LAST_30_DAYS = '30days',
  LAST_90_DAYS = '90days',
  LAST_6_MONTHS = '6months',
  LAST_12_MONTHS = '12months',
  ALL_TIME = 'all',
}

registerEnumType(PaymentMethod, { name: 'PaymentMethod' });
registerEnumType(PaymentStatus, { name: 'PaymentStatus' });
registerEnumType(PaymentPeriod, { name: 'PaymentPeriod' });

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

  @Field(() => String)
  refundedAmount: string;

  @Field(() => String)
  refundableAmount: string;

  @Field(() => GraphQLISODateTime, { nullable: true })
  refundedAt: Date | null;

  @Field(() => String, { nullable: true })
  refundReason: string | null;

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
export class PaymentOverviewCurrency {
  @Field(() => String)
  currency: string;

  @Field(() => String)
  failedAmount: string;

  @Field(() => Int)
  failedCount: number;

  @Field(() => String)
  grossAmount: string;

  @Field(() => Int)
  grossCount: number;

  @Field(() => String)
  inProgressAmount: string;

  @Field(() => Int)
  inProgressCount: number;

  @Field(() => String)
  refundedAmount: string;

  @Field(() => Int)
  refundedCount: number;

  @Field(() => String)
  netAmount: string;
}

@ObjectType()
export class PaymentOverview {
  @Field(() => PaymentPeriod)
  period: PaymentPeriod;

  @Field(() => GraphQLISODateTime, { nullable: true })
  startAt: Date | null;

  @Field(() => GraphQLISODateTime)
  endAt: Date;

  @Field(() => String)
  timeZone: string;

  @Field(() => [PaymentOverviewCurrency])
  currencies: PaymentOverviewCurrency[];
}

@ObjectType()
export class RevenueFlowSummary {
  @Field(() => String)
  bookedSales: string;

  @Field(() => Int)
  bookedDeals: number;

  @Field(() => String)
  failedAmount: string;

  @Field(() => Int)
  failedCount: number;

  @Field(() => String)
  grossReceived: string;

  @Field(() => Int)
  settledPayments: number;

  @Field(() => String)
  inProgressAmount: string;

  @Field(() => Int)
  inProgressCount: number;

  @Field(() => String)
  refunds: string;

  @Field(() => Int)
  refundedPayments: number;

  @Field(() => String)
  netReceived: string;
}

@ObjectType()
export class RevenueFlowBucket {
  @Field(() => GraphQLISODateTime)
  startAt: Date;

  @Field(() => String)
  bookedSales: string;

  @Field(() => Int)
  bookedDeals: number;

  @Field(() => String)
  grossReceived: string;

  @Field(() => Int)
  settledPayments: number;

  @Field(() => String)
  refunds: string;

  @Field(() => Int)
  refundedPayments: number;

  @Field(() => String)
  netReceived: string;
}

@ObjectType()
export class RevenueFlowMethod {
  @Field(() => PaymentMethod)
  paymentMethod: PaymentMethod;

  @Field(() => String)
  grossReceived: string;

  @Field(() => Int)
  settledPayments: number;

  @Field(() => String)
  refunds: string;

  @Field(() => Int)
  refundedPayments: number;

  @Field(() => String)
  netReceived: string;
}

@ObjectType()
export class RevenueFlowCurrency {
  @Field(() => String)
  currency: string;

  @Field(() => RevenueFlowSummary)
  summary: RevenueFlowSummary;

  @Field(() => [RevenueFlowBucket])
  buckets: RevenueFlowBucket[];

  @Field(() => [RevenueFlowMethod])
  methods: RevenueFlowMethod[];
}

@ObjectType()
export class RevenueFlow {
  @Field(() => PaymentPeriod)
  period: PaymentPeriod;

  @Field(() => GraphQLISODateTime, { nullable: true })
  startAt: Date | null;

  @Field(() => GraphQLISODateTime)
  endAt: Date;

  @Field(() => String)
  timeZone: string;

  @Field(() => String)
  bucketUnit: string;

  @Field(() => [RevenueFlowCurrency])
  currencies: RevenueFlowCurrency[];
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

@ObjectType()
export class RefundPaymentResult {
  @Field(() => Payment)
  payment: Payment;

  @Field(() => InvoicePaymentBalance, { nullable: true })
  invoice: InvoicePaymentBalance | null;

  @Field(() => String)
  refundStatus: string;
}
