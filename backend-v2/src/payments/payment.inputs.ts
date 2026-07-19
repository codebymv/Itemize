import { Field, InputType, Int } from '@nestjs/graphql';
import { PaymentMethod, PaymentStatus } from './payment.types';

@InputType()
export class RecordPaymentInput {
  @Field(() => Int, { nullable: true })
  invoiceId?: number;

  @Field(() => Int, { nullable: true })
  contactId?: number;

  @Field(() => String)
  amount: string;

  @Field(() => String, { defaultValue: 'USD' })
  currency = 'USD';

  @Field(() => PaymentMethod, { defaultValue: PaymentMethod.OTHER })
  paymentMethod = PaymentMethod.OTHER;

  @Field(() => PaymentStatus, { defaultValue: PaymentStatus.SUCCEEDED })
  status = PaymentStatus.SUCCEEDED;

  @Field(() => String, { nullable: true })
  paymentDate?: string;

  @Field(() => String, { nullable: true })
  notes?: string | null;
}

@InputType()
export class RecordInvoicePaymentInput {
  @Field(() => String)
  amount: string;

  @Field(() => PaymentMethod, { defaultValue: PaymentMethod.OTHER })
  paymentMethod = PaymentMethod.OTHER;

  @Field(() => String, { nullable: true })
  notes?: string | null;
}
