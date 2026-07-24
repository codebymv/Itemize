import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { PageInfo } from '../common/pagination';

@ObjectType()
export class WorkspaceVaultItem {
  @Field(() => Int) id: number;
  @Field(() => Int) vaultId: number;
  @Field() itemType: string;
  @Field() label: string;
  @Field() value: string;
  @Field(() => Int) orderIndex: number;
  @Field() createdAt: Date;
  @Field() updatedAt: Date;
}

@ObjectType()
export class WorkspaceVault {
  @Field(() => Int) id: number;
  @Field(() => Int) userId: number;
  @Field() title: string;
  @Field() category: string;
  @Field() colorValue: string;
  @Field(() => Float) positionX: number;
  @Field(() => Float) positionY: number;
  @Field(() => Int) width: number;
  @Field(() => Int) height: number;
  @Field(() => Int) zIndex: number;
  @Field() isLocked: boolean;
  @Field(() => String, { nullable: true }) encryptionSalt: string | null;
  @Field(() => Int) itemCount: number;
  @Field(() => [WorkspaceVaultItem]) items: WorkspaceVaultItem[];
  @Field() requiresUnlock: boolean;
  @Field(() => String, { nullable: true }) shareToken: string | null;
  @Field() isPublic: boolean;
  @Field(() => Date, { nullable: true }) sharedAt: Date | null;
  @Field() createdAt: Date;
  @Field() updatedAt: Date;
}

@ObjectType()
export class WorkspaceVaultPage {
  @Field(() => [WorkspaceVault]) nodes: WorkspaceVault[];
  @Field(() => PageInfo) pageInfo: PageInfo;
}

@ObjectType()
export class DeleteWorkspaceVaultResult {
  @Field(() => Int) deletedId: number;
}

@ObjectType()
export class WorkspaceVaultItemsResult {
  @Field(() => [WorkspaceVaultItem]) items: WorkspaceVaultItem[];
  @Field(() => Int) count: number;
}

@ObjectType()
export class DeleteWorkspaceVaultItemResult {
  @Field(() => Int) deletedId: number;
}
