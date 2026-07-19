import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class ProductFilterInput {
  @Field(() => Boolean, { nullable: true })
  isActive?: boolean;

  @Field(() => String, { nullable: true })
  search?: string;
}

@InputType()
export class CreateProductInput {
  @Field(() => String)
  name: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => String, { nullable: true })
  sku?: string | null;

  @Field(() => String)
  price: string;

  @Field(() => String, { defaultValue: 'USD' })
  currency = 'USD';

  @Field(() => String, { defaultValue: 'one_time' })
  productType = 'one_time';

  @Field(() => String, { nullable: true })
  billingPeriod?: string | null;

  @Field(() => String, { defaultValue: '0' })
  taxRate = '0';

  @Field(() => Boolean, { defaultValue: true })
  taxable = true;

  @Field(() => Boolean, { defaultValue: true })
  isActive = true;
}

@InputType()
export class UpdateProductInput {
  @Field(() => String, { nullable: true })
  name?: string | null;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => String, { nullable: true })
  sku?: string | null;

  @Field(() => String, { nullable: true })
  price?: string | null;

  @Field(() => String, { nullable: true })
  currency?: string | null;

  @Field(() => String, { nullable: true })
  productType?: string | null;

  @Field(() => String, { nullable: true })
  billingPeriod?: string | null;

  @Field(() => String, { nullable: true })
  taxRate?: string | null;

  @Field(() => Boolean, { nullable: true })
  taxable?: boolean | null;

  @Field(() => Boolean, { nullable: true })
  isActive?: boolean | null;
}
