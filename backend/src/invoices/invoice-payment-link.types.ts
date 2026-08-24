import { Field, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum InvoicePaymentLinkStatus {
  PROCESSING = 'processing',
  READY = 'ready',
  REJECTED = 'rejected',
  RECONCILIATION_REQUIRED = 'reconciliation_required',
}

registerEnumType(InvoicePaymentLinkStatus, {
  name: 'InvoicePaymentLinkStatus',
});

@ObjectType()
export class InvoicePaymentLinkResult {
  @Field()
  success: boolean;

  @Field()
  replayed: boolean;

  @Field(() => Int)
  intentId: number;

  @Field(() => InvoicePaymentLinkStatus)
  status: InvoicePaymentLinkStatus;

  @Field(() => String, { nullable: true })
  url: string | null;

  @Field(() => String, { nullable: true })
  sessionId: string | null;
}
