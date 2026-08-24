import { Field, InputType, Int } from '@nestjs/graphql';

@InputType()
export class EstimateFilterInput {
  @Field(() => String, { nullable: true })
  status?: string;

  @Field(() => Int, { nullable: true })
  contactId?: number;

  @Field(() => String, { nullable: true })
  search?: string;
}

@InputType()
export class EstimateItemInput {
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
export class CreateEstimateInput {
  @Field(() => Int, { nullable: true })
  contactId?: number | null;

  @Field(() => String, { nullable: true })
  customerName?: string | null;

  @Field(() => String, { nullable: true })
  customerEmail?: string | null;

  @Field(() => String, { nullable: true })
  customerPhone?: string | null;

  @Field(() => String, { nullable: true })
  customerAddress?: string | null;

  @Field(() => String, { nullable: true })
  validUntil?: string | null;

  @Field(() => [EstimateItemInput])
  items: EstimateItemInput[];

  @Field(() => String, { nullable: true })
  discountType?: string | null;

  @Field(() => String, { defaultValue: '0' })
  discountValue = '0';

  @Field(() => String, { nullable: true })
  notes?: string | null;

  @Field(() => String, { nullable: true })
  termsAndConditions?: string | null;
}

@InputType()
export class UpdateEstimateInput {
  @Field(() => Int, { nullable: true })
  contactId?: number | null;

  @Field(() => String, { nullable: true })
  customerName?: string | null;

  @Field(() => String, { nullable: true })
  customerEmail?: string | null;

  @Field(() => String, { nullable: true })
  customerPhone?: string | null;

  @Field(() => String, { nullable: true })
  customerAddress?: string | null;

  @Field(() => String, { nullable: true })
  validUntil?: string | null;

  @Field(() => [EstimateItemInput], { nullable: true })
  items?: EstimateItemInput[] | null;

  @Field(() => String, { nullable: true })
  discountType?: string | null;

  @Field(() => String, { nullable: true })
  discountValue?: string | null;

  @Field(() => String, { nullable: true })
  notes?: string | null;

  @Field(() => String, { nullable: true })
  termsAndConditions?: string | null;
}
