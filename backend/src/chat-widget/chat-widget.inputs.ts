import { Field, InputType, Int } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';

@InputType()
export class ChatWidgetConfigInput {
  @Field(() => String, { nullable: true }) name?: string;
  @Field(() => String, { nullable: true }) primaryColor?: string;
  @Field(() => String, { nullable: true }) textColor?: string;
  @Field(() => String, { nullable: true }) position?: string;
  @Field(() => String, { nullable: true }) iconStyle?: string;
  @Field(() => String, { nullable: true }) customIconUrl?: string | null;
  @Field(() => String, { nullable: true }) welcomeTitle?: string;
  @Field(() => String, { nullable: true }) welcomeMessage?: string;
  @Field(() => String, { nullable: true }) placeholderText?: string;
  @Field(() => Boolean, { nullable: true }) requireEmail?: boolean;
  @Field(() => Boolean, { nullable: true }) requireName?: boolean;
  @Field(() => Boolean, { nullable: true }) requirePhone?: boolean;
  @Field(() => GraphQLJSON, { nullable: true }) customFields?: unknown[];
  @Field(() => Boolean, { nullable: true }) isActive?: boolean;
  @Field(() => Int, { nullable: true }) autoOpenDelay?: number;
  @Field(() => Boolean, { nullable: true }) showBranding?: boolean;
  @Field(() => Boolean, { nullable: true }) notificationSound?: boolean;
  @Field(() => GraphQLJSON, { nullable: true })
  businessHours?: Record<string, unknown> | null;
  @Field(() => String, { nullable: true }) offlineMessage?: string;
  @Field(() => Int, { nullable: true }) defaultAssignedTo?: number | null;
  @Field(() => Boolean, { nullable: true }) autoAssignAvailable?: boolean;
  @Field(() => [String], { nullable: true }) allowedDomains?: string[];
}

@InputType()
export class SendAgentChatMessageInput {
  @Field() content: string;
  @Field() idempotencyKey: string;
}
