import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class CreateBillingCheckoutInput {
  @Field(() => String, { nullable: true })
  planId?: string;

  @Field(() => String, { nullable: true })
  priceId?: string;

  @Field(() => String, { nullable: true })
  billingPeriod?: string;

  @Field(() => String, { nullable: true })
  mode?: string;

  @Field()
  successUrl: string;

  @Field()
  cancelUrl: string;

  @Field()
  idempotencyKey: string;
}

@InputType()
export class CreateBillingPortalInput {
  @Field()
  returnUrl: string;

  @Field()
  idempotencyKey: string;
}
