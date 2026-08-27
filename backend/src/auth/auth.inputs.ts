import { Field, InputType, registerEnumType } from '@nestjs/graphql';

export enum SignupMode {
  FREE = 'FREE',
  TRIAL = 'TRIAL',
}

registerEnumType(SignupMode, {
  name: 'SignupMode',
  description: 'The commercial state assigned to a newly-created organization.',
});

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

  @Field(() => SignupMode, { nullable: true, defaultValue: SignupMode.FREE })
  signupMode?: SignupMode;
}

@InputType()
export class RegisterInput {
  @Field()
  email: string;

  @Field()
  password: string;

  @Field({ nullable: true })
  name?: string;

  @Field(() => SignupMode, { nullable: true, defaultValue: SignupMode.FREE })
  signupMode?: SignupMode;

  @Field({ nullable: true })
  invitationToken?: string;
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

  @Field({ nullable: true })
  invitationToken?: string;
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

@InputType()
export class DeleteViewerAccountInput {
  @Field()
  confirmation: string;

  @Field({ nullable: true })
  currentPassword?: string;
}

@InputType()
export class RecoverViewerAccountInput {
  @Field()
  token: string;
}
