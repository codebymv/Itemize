import { Field, ObjectType } from '@nestjs/graphql';
import { InvoiceBusiness } from '../invoice-businesses/invoice-business.types';
import { RecurringInvoice } from '../recurring-invoices/recurring-invoice.types';

@ObjectType()
export class RecurringInvoicePreviewBootstrap {
  @Field(() => RecurringInvoice)
  recurringInvoice: RecurringInvoice;

  @Field()
  previewInvoiceNumber: string;

  @Field(() => InvoiceBusiness, { nullable: true })
  business: InvoiceBusiness | null;
}
