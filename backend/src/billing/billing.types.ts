import {
  Field,
  Float,
  GraphQLISODateTime,
  Int,
  ObjectType,
} from '@nestjs/graphql';

@ObjectType()
export class BillingStatus {
  @Field()
  plan: string;

  @Field()
  subscriptionStatus: string;

  @Field()
  billingPeriod: string;

  @Field(() => GraphQLISODateTime, { nullable: true })
  billingPeriodStart: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  billingPeriodEnd: Date | null;

  @Field(() => String, { nullable: true })
  stripeCustomerId: string | null;

  @Field(() => String, { nullable: true })
  stripeSubscriptionId: string | null;

  @Field(() => Int)
  emailsUsed: number;

  @Field(() => Int)
  emailsLimit: number;

  @Field(() => Int)
  smsUsed: number;

  @Field(() => Int)
  smsLimit: number;

  @Field(() => Int)
  apiCallsUsed: number;

  @Field(() => Int)
  apiCallsLimit: number;

  @Field(() => Int)
  contactsLimit: number;

  @Field(() => Int)
  usersLimit: number;

  @Field(() => Int)
  workflowsLimit: number;

  @Field(() => Int)
  landingPagesLimit: number;

  @Field(() => Int)
  formsLimit: number;

  @Field(() => Int)
  calendarsLimit: number;

  @Field(() => GraphQLISODateTime, { nullable: true })
  trialStartedAt: Date | null;

  @Field()
  trialEligible: boolean;

  @Field(() => GraphQLISODateTime, { nullable: true })
  trialEndsAt: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  trialEndAcknowledgedAt: Date | null;

  @Field()
  cancelAtPeriodEnd: boolean;

  @Field(() => GraphQLISODateTime, { nullable: true })
  canceledAt: Date | null;
}

@ObjectType()
export class BillingPlanPricing {
  @Field(() => Float)
  monthly: number;

  @Field(() => Float)
  yearly: number;

  @Field(() => Float)
  yearlyMonthly: number;
}

@ObjectType()
export class BillingPlanLimits {
  @Field(() => Int)
  organizations: number;

  @Field(() => Int)
  contacts: number;

  @Field(() => Int)
  users: number;

  @Field(() => Int)
  workflows: number;

  @Field(() => Int)
  emails: number;

  @Field(() => Int)
  sms: number;

  @Field(() => Int)
  landingPages: number;

  @Field(() => Int)
  forms: number;

  @Field(() => Int)
  calendars: number;

  @Field(() => Int)
  apiCalls: number;

  @Field(() => Int)
  storage: number;
}

@ObjectType()
export class BillingPlan {
  @Field()
  id: string;

  @Field()
  name: string;

  @Field()
  displayName: string;

  @Field()
  tagline: string;

  @Field()
  description: string;

  @Field()
  icon: string;

  @Field()
  color: string;

  @Field()
  bgColor: string;

  @Field()
  borderColor: string;

  @Field()
  popular: boolean;

  @Field(() => BillingPlanPricing)
  pricing: BillingPlanPricing;

  @Field(() => Int)
  tier: number;

  @Field(() => BillingPlanLimits)
  limits: BillingPlanLimits;
}

@ObjectType()
export class BillingUsageMeter {
  @Field(() => Int)
  used: number;

  @Field(() => Int)
  limit: number;

  @Field(() => Int)
  percentage: number;
}

@ObjectType()
export class BillingUsagePeriod {
  @Field(() => GraphQLISODateTime, { nullable: true })
  start: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  end: Date | null;
}

@ObjectType()
export class BillingUsageMeters {
  @Field(() => BillingUsageMeter)
  emails: BillingUsageMeter;

  @Field(() => BillingUsageMeter)
  sms: BillingUsageMeter;

  @Field(() => BillingUsageMeter)
  apiCalls: BillingUsageMeter;
}

@ObjectType()
export class BillingResourceCounts {
  @Field(() => Int)
  contacts: number;

  @Field(() => Int)
  workflows: number;

  @Field(() => Int)
  forms: number;

  @Field(() => Int)
  landingPages: number;
}

@ObjectType()
export class BillingUsage {
  @Field(() => BillingUsagePeriod)
  period: BillingUsagePeriod;

  @Field(() => BillingUsageMeters)
  usage: BillingUsageMeters;

  @Field(() => BillingResourceCounts)
  resources: BillingResourceCounts;
}

@ObjectType()
export class BillingSession {
  @Field()
  url: string;
}

@ObjectType()
export class TrialAcknowledgement {
  @Field()
  acknowledged: boolean;
}
