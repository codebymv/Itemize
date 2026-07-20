import { Field, InputType, Int } from '@nestjs/graphql';

@InputType()
export class RecurringInvoiceFilterInput {
  @Field(() => String, { nullable: true })
  status?: string;
}

@InputType()
export class RecurringInvoiceItemInput {
  @Field(() => Int, { nullable: true })
  productId?: number | null;

  @Field()
  name: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => String, { defaultValue: '1' })
  quantity = '1';

  @Field(() => String, { defaultValue: '0' })
  unitPrice = '0';

  @Field(() => String, { defaultValue: '0' })
  taxRate = '0';
}

@InputType()
export class CreateRecurringInvoiceInput {
  @Field()
  templateName: string;

  @Field(() => Int, { nullable: true })
  contactId?: number | null;

  @Field(() => String, { nullable: true })
  customerName?: string | null;

  @Field(() => String, { nullable: true })
  customerEmail?: string | null;

  @Field()
  frequency: string;

  @Field()
  startDate: string;

  @Field(() => String, { nullable: true })
  endDate?: string | null;

  @Field(() => [RecurringInvoiceItemInput])
  items: RecurringInvoiceItemInput[];

  @Field(() => String, { nullable: true })
  discountType?: string | null;

  @Field(() => String, { defaultValue: '0' })
  discountValue = '0';

  @Field(() => String, { nullable: true })
  notes?: string | null;

  @Field(() => String, { nullable: true })
  paymentTerms?: string | null;
}

@InputType()
export class CreateRecurringInvoiceFromInvoiceInput {
  @Field()
  templateName: string;

  @Field()
  frequency: string;

  @Field()
  startDate: string;

  @Field(() => String, { nullable: true })
  endDate?: string | null;
}

@InputType()
export class UpdateRecurringInvoiceInput {
  @Field(() => String, { nullable: true })
  templateName?: string;

  @Field(() => Int, { nullable: true })
  contactId?: number | null;

  @Field(() => String, { nullable: true })
  customerName?: string | null;

  @Field(() => String, { nullable: true })
  customerEmail?: string | null;

  @Field(() => String, { nullable: true })
  frequency?: string;

  @Field(() => String, { nullable: true })
  endDate?: string | null;

  @Field(() => [RecurringInvoiceItemInput], { nullable: true })
  items?: RecurringInvoiceItemInput[] | null;

  @Field(() => String, { nullable: true })
  discountType?: string | null;

  @Field(() => String, { nullable: true })
  discountValue?: string | null;

  @Field(() => String, { nullable: true })
  notes?: string | null;

  @Field(() => String, { nullable: true })
  paymentTerms?: string | null;
}
