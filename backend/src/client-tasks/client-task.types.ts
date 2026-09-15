import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';
import { PageInfo } from '../common/pagination';
@InputType()
export class CreateClientTaskInput {
    @Field(() => Int, { nullable: true })
    contactId?: number | null;
    @Field()
    title: string;
    @Field(() => String, { nullable: true })
    description?: string | null;
    @Field(() => String, { nullable: true })
    priority?: string;
    @Field(() => String, { nullable: true })
    dueAt?: string | null;
    @Field(() => Int, { nullable: true })
    assignedToId?: number | null;
}
@InputType()
export class UpdateClientTaskInput {
    @Field(() => String, { nullable: true })
    title?: string;
    @Field(() => String, { nullable: true })
    description?: string | null;
    @Field(() => String, { nullable: true })
    priority?: string;
    @Field(() => String, { nullable: true })
    dueAt?: string | null;
    @Field(() => Int, { nullable: true })
    assignedToId?: number | null;
}
@InputType()
export class ClientTaskFilterInput {
    @Field(() => Int, { nullable: true })
    contactId?: number;
    @Field(() => String, { nullable: true })
    view?: string;
    @Field(() => String, { nullable: true })
    status?: string;
}
@ObjectType()
export class ClientTask {
    @Field(() => Int)
    id: number;
    @Field(() => Int, { nullable: true })
    contactId: number | null;
    @Field()
    title: string;
    @Field(() => String, { nullable: true })
    description: string | null;
    @Field()
    priority: string;
    @Field()
    status: string;
    @Field(() => Int, { nullable: true })
    assignedToId: number | null;
    @Field(() => String, { nullable: true })
    assignedToName: string | null;
    @Field(() => String, { nullable: true })
    dueAt: string | null;
    @Field(() => String, { nullable: true })
    completedAt: string | null;
    @Field()
    updatedAt: string;
    @Field(() => Int)
    version: number;
    @Field()
    canEdit: boolean;
    @Field()
    canClaim: boolean;
}
@ObjectType()
export class ClientTaskAssignee {
    @Field(() => Int)
    id: number;
    @Field()
    name: string;
}
@ObjectType()
export class ClientTaskPage {
    @Field(() => [ClientTask])
    nodes: ClientTask[];
    @Field(() => PageInfo)
    pageInfo: PageInfo;
    @Field()
    canCreate: boolean;
    @Field()
    canManage: boolean;
    @Field(() => Int)
    viewerId: number;
    @Field(() => [ClientTaskAssignee])
    assignees: ClientTaskAssignee[];
}
