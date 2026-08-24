import { Field, InputType, Int } from '@nestjs/graphql';

@InputType()
export class PipelineStageInput {
  @Field()
  id: string;

  @Field()
  name: string;

  @Field({ nullable: true })
  color?: string;

  @Field(() => Int, { nullable: true })
  order?: number;
}

@InputType()
export class CreatePipelineInput {
  @Field()
  name: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => [PipelineStageInput], { nullable: true })
  stages?: PipelineStageInput[];

  @Field({ nullable: true })
  isDefault?: boolean;
}

@InputType()
export class UpdatePipelineInput {
  @Field(() => String, { nullable: true })
  name?: string | null;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => [PipelineStageInput], { nullable: true })
  stages?: PipelineStageInput[] | null;

  @Field(() => Boolean, { nullable: true })
  isDefault?: boolean | null;
}
