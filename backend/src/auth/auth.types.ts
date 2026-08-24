import { Field, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class AuthSessionUser {
  @Field(() => Int)
  uid: number;

  @Field()
  email: string;

  @Field()
  name: string;

  @Field()
  role: string;

  @Field()
  photoURL: string;
}

@ObjectType()
export class AuthSessionPayload {
  @Field()
  success: boolean;

  @Field(() => AuthSessionUser)
  user: AuthSessionUser;
}

@ObjectType()
export class AuthSessionStatus {
  @Field()
  success: boolean;
}

@ObjectType()
export class AuthMessagePayload {
  @Field()
  success: boolean;

  @Field()
  message: string;

  @Field({ nullable: true })
  email?: string;
}

@ObjectType()
export class CsrfTokenPayload {
  @Field()
  token: string;
}

@ObjectType()
export class CurrentUser {
  @Field(() => Int)
  id: number;

  @Field()
  email: string;

  @Field()
  name: string;

  @Field()
  provider: string;

  @Field()
  emailVerified: boolean;

  @Field()
  role: string;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;
}
