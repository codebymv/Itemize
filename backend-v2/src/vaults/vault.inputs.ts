import { Field, Float, InputType, Int } from '@nestjs/graphql';

@InputType()
export class WorkspaceVaultFilterInput {
  @Field(() => String, { nullable: true }) category?: string;
  @Field(() => String, { nullable: true }) search?: string;
}

@InputType()
export class CreateWorkspaceVaultInput {
  @Field(() => String, { nullable: true }) title?: string;
  @Field(() => String, { nullable: true }) category?: string;
  @Field(() => String, { nullable: true }) colorValue?: string;
  @Field(() => Float) positionX: number;
  @Field(() => Float) positionY: number;
  @Field(() => Int, { nullable: true }) width?: number;
  @Field(() => Int, { nullable: true }) height?: number;
  @Field(() => Int, { nullable: true }) zIndex?: number;
  @Field(() => String, { nullable: true }) masterPassword?: string;
}

@InputType()
export class UpdateWorkspaceVaultInput {
  @Field(() => String, { nullable: true }) title?: string | null;
  @Field(() => String, { nullable: true }) category?: string | null;
  @Field(() => String, { nullable: true }) colorValue?: string | null;
  @Field(() => Float, { nullable: true }) positionX?: number | null;
  @Field(() => Float, { nullable: true }) positionY?: number | null;
  @Field(() => Int, { nullable: true }) width?: number | null;
  @Field(() => Int, { nullable: true }) height?: number | null;
  @Field(() => Int, { nullable: true }) zIndex?: number | null;
}
