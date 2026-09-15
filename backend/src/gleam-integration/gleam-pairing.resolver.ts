import { Args, Field, InputType, Int, Mutation, ObjectType, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { GleamPairingService } from './gleam-pairing.service';

@InputType()
class CreateGleamPairingInput {
  @Field() code!: string;
  @Field(() => Int) defaultAssigneeId!: number;
  @Field(() => Int) dueAfterMinutes!: number;
}
@ObjectType()
class GleamPairingAssignee {
  @Field(() => Int) id!: number;
  @Field() name!: string;
}
@ObjectType()
class GleamPairingRequest {
  @Field() id!: string;
  @Field() state!: string;
  @Field({nullable: true}) source_name?: string;
  @Field({nullable: true}) connection_id?: string;
  @Field() expires_at!: string;
  @Field(() => Int) default_assignee_id!: number;
  @Field(() => Int) due_after_minutes!: number;
}
@ObjectType()
class GleamPairingOverview {
  @Field() enabled!: boolean;
  @Field(() => Int) organizationId!: number;
  @Field() organizationName!: string;
  @Field(() => GleamPairingRequest, {nullable: true}) pairing?: GleamPairingRequest;
  @Field(() => [GleamPairingAssignee]) assignees!: GleamPairingAssignee[];
}
@Resolver()
export class GleamPairingResolver {
  constructor(private readonly pairing: GleamPairingService, private readonly context: RequestContextService) {}
  @OrganizationScoped()
  @Query(() => GleamPairingOverview)
  gleamPairingOverview() { return this.pairing.status(this.organizationId(), this.actor()); }
  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => GleamPairingOverview)
  createGleamPairing(@Args('input') input: CreateGleamPairingInput, @Args('idempotencyKey') key: string) {
    return this.pairing.start(this.organizationId(), this.actor(), input, key);
  }
  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => GleamPairingOverview)
  approveGleamPairing(@Args('id') id: string, @Args('idempotencyKey') key: string) {
    return this.pairing.approve(this.organizationId(), this.actor(), id, key);
  }
  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => GleamPairingOverview)
  disconnectGleamConnection(@Args('id') id: string, @Args('idempotencyKey') key: string) {
    return this.pairing.disconnect(this.organizationId(), this.actor(), id, key);
  }
  private organizationId() { return this.context.current().organization!.organizationId; }
  private actor() { return this.context.current().identity!.userId; }
}
