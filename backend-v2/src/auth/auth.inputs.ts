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

@InputType()
export class RequestPasswordResetInput {
  @Field()
  email: string;
}

@InputType()
export class ResetPasswordInput {
  @Field()
  token: string;

  @Field()
  password: string;
}

@InputType()
export class ChangePasswordInput {
  @Field()
  currentPassword: string;

  @Field()
  newPassword: string;
}

@InputType()
export class UpdateViewerProfileInput {
  @Field()
  name: string;
}
