import { Field, InputType, Int } from '@nestjs/graphql';

@InputType()
export class InvoiceFilterInput {
  @Field(() => String, { nullable: true })
  status?: string;

  @Field(() => Int, { nullable: true })
  contactId?: number;

  @Field(() => String, { nullable: true })
  search?: string;
}

@InputType()
export class InvoiceItemInput {
  @Field(() => Int, { nullable: true })
  productId?: number | null;

  @Field(() => String)
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
export class CreateInvoiceInput {
  @Field(() => Int, { nullable: true })
  contactId?: number | null;

  @Field(() => Int, { nullable: true })
  businessId?: number | null;

  @Field(() => String, { nullable: true })
  customerName?: string | null;

  @Field(() => String, { nullable: true })
  customerEmail?: string | null;

  @Field(() => String, { nullable: true })
  customerPhone?: string | null;

  @Field(() => String, { nullable: true })
  customerAddress?: string | null;

  @Field(() => String, { nullable: true })
  issueDate?: string | null;

  @Field(() => String, { nullable: true })
  dueDate?: string | null;

  @Field(() => [InvoiceItemInput])
  items: InvoiceItemInput[];

  @Field(() => String, { nullable: true })
  discountType?: string | null;

  @Field(() => String, { defaultValue: '0' })
  discountValue = '0';

  @Field(() => String, { defaultValue: '0' })
  taxRate = '0';

  @Field(() => String, { nullable: true })
  notes?: string | null;

  @Field(() => String, { nullable: true })
  termsAndConditions?: string | null;

  @Field(() => String, { nullable: true })
  paymentTerms?: string | null;
}

@InputType()
export class UpdateInvoiceInput {
  @Field(() => Int, { nullable: true })
  contactId?: number | null;

  @Field(() => Int, { nullable: true })
  businessId?: number | null;

  @Field(() => String, { nullable: true })
  customerName?: string | null;

  @Field(() => String, { nullable: true })
  customerEmail?: string | null;

  @Field(() => String, { nullable: true })
  customerPhone?: string | null;

  @Field(() => String, { nullable: true })
  customerAddress?: string | null;

  @Field(() => String, { nullable: true })
  issueDate?: string | null;

  @Field(() => String, { nullable: true })
  dueDate?: string | null;

  @Field(() => [InvoiceItemInput], { nullable: true })
  items?: InvoiceItemInput[] | null;

  @Field(() => String, { nullable: true })
  discountType?: string | null;

  @Field(() => String, { nullable: true })
  discountValue?: string | null;

  @Field(() => String, { nullable: true })
  taxRate?: string | null;

  @Field(() => String, { nullable: true })
  notes?: string | null;

  @Field(() => String, { nullable: true })
  termsAndConditions?: string | null;

  @Field(() => String, { nullable: true })
  paymentTerms?: string | null;
}

@InputType()
export class PreviewInvoiceEmailInput {
  @Field(() => String)
  message: string;

  @Field(() => String, { nullable: true })
  subject?: string | null;

  @Field(() => Boolean, { defaultValue: false })
  includePaymentLink = false;
}

@InputType()
export class SendInvoiceInput {
  @Field(() => String)
  idempotencyKey: string;

  @Field(() => String)
  subject: string;

  @Field(() => String)
  message: string;

  @Field(() => [String], { defaultValue: [] })
  ccEmails: string[] = [];

  @Field(() => Boolean, { defaultValue: false })
  includePaymentLink = false;

  @Field(() => Boolean, { defaultValue: false })
  resend = false;
}
