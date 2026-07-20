import { Field, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class InvoiceSettings {
  @Field(() => Int, { nullable: true })
  id: number | null;

  @Field(() => Int)
  organizationId: number;

  @Field(() => String, { nullable: true })
  stripeAccountId: string | null;

  @Field(() => String, { nullable: true })
  stripePublishableKey: string | null;

  @Field(() => Boolean)
  stripeConnected: boolean;

  @Field(() => GraphQLISODateTime, { nullable: true })
  stripeConnectedAt: Date | null;

  @Field(() => String)
  invoicePrefix: string;

  @Field(() => Int)
  nextInvoiceNumber: number;

  @Field(() => Int)
  defaultPaymentTerms: number;

  @Field(() => String, { nullable: true })
  defaultNotes: string | null;

  @Field(() => String, { nullable: true })
  defaultTerms: string | null;

  @Field(() => String)
  defaultTaxRate: string;

  @Field(() => String, { nullable: true })
  taxId: string | null;

  @Field(() => String, { nullable: true })
  businessName: string | null;

  @Field(() => String, { nullable: true })
  businessAddress: string | null;

  @Field(() => String, { nullable: true })
  businessPhone: string | null;

  @Field(() => String, { nullable: true })
  businessEmail: string | null;

  @Field(() => String, { nullable: true })
  logoUrl: string | null;

  @Field(() => String)
  defaultCurrency: string;

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt: Date | null;
}
