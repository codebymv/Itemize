import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class LoginInput {
  @Field()
  email: string;

  @Field()
  password: string;
}

@InputType()
export class GoogleAccessTokenInput {
  @Field()
  accessToken: string;
}

@InputType()
export class RegisterInput {
  @Field()
  email: string;

  @Field()
  password: string;

  @Field({ nullable: true })
  name?: string;
}

@InputType()
export class VerifyEmailInput {
  @Field()
  token: string;
}

@InputType()
export class ResendVerificationInput {
  @Field()
  email: string;
}
