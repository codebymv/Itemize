import { Field, ObjectType } from '@nestjs/graphql';
import { Contact } from '../contacts/contact.types';
import { Estimate } from '../estimates/estimate.types';
import { InvoiceBusiness } from '../invoice-businesses/invoice-business.types';
import { InvoiceSettings } from '../invoice-settings/invoice-settings.types';
import { Invoice } from '../invoices/invoice.types';
import { Product } from '../products/product.types';

@ObjectType()
export class InvoiceEditorBootstrap {
  @Field(() => [Contact])
  contacts: Contact[];

  @Field(() => [Product])
  products: Product[];

  @Field(() => [InvoiceBusiness])
  businesses: InvoiceBusiness[];

  @Field(() => InvoiceSettings)
  settings: InvoiceSettings;

  @Field(() => Invoice, { nullable: true })
  invoice: Invoice | null;
}

@ObjectType()
export class EstimateEditorBootstrap {
  @Field(() => [Contact])
  contacts: Contact[];

  @Field(() => [Product])
  products: Product[];

  @Field(() => Estimate, { nullable: true })
  estimate: Estimate | null;

  @Field(() => Contact, { nullable: true })
  initialContact: Contact | null;
}
