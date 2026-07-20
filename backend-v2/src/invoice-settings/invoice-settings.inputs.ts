import { Field, InputType, Int } from '@nestjs/graphql';

@InputType()
export class UpdateInvoiceSettingsInput {
  @Field(() => String, { nullable: true })
  invoicePrefix?: string | null;

  @Field(() => Int, { nullable: true })
  nextInvoiceNumber?: number | null;

  @Field(() => Int, { nullable: true })
  defaultPaymentTerms?: number | null;

  @Field(() => String, { nullable: true })
  defaultNotes?: string | null;

  @Field(() => String, { nullable: true })
  defaultTerms?: string | null;

  @Field(() => String, { nullable: true })
  defaultTaxRate?: string | null;

  @Field(() => String, { nullable: true })
  taxId?: string | null;

  @Field(() => String, { nullable: true })
  businessName?: string | null;

  @Field(() => String, { nullable: true })
  businessAddress?: string | null;

  @Field(() => String, { nullable: true })
  businessPhone?: string | null;

  @Field(() => String, { nullable: true })
  businessEmail?: string | null;

  @Field(() => String, { nullable: true })
  defaultCurrency?: string | null;
}
