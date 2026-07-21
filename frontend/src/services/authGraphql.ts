import {
  graphqlMutationRequest,
  graphqlPublicRequest,
  graphqlRequest,
} from '@/services/graphqlClient';

export type AuthGraphqlUser = {
  uid: number;
  email: string;
  name: string;
  role: 'USER' | 'ADMIN';
  photoURL: string;
};

export type CurrentGraphqlUser = {
  id: number;
  email: string;
  name: string;
  provider: string;
  emailVerified: boolean;
  role: 'USER' | 'ADMIN';
  createdAt: string;
};

export const isAuthSessionGraphqlEnabled = (): boolean =>
  import.meta.env.VITE_AUTH_SESSION_GRAPHQL === 'true';

export const isAuthIdentityGraphqlEnabled = (): boolean =>
  import.meta.env.VITE_AUTH_IDENTITY_GRAPHQL === 'true';

const SESSION_FIELDS = `
  success
  user { uid email name role photoURL }
`;

export const loginViaGraphql = async (email: string, password: string) => {
  const data = await graphqlPublicRequest<
    { login: { success: boolean; user: AuthGraphqlUser } },
    { input: { email: string; password: string } }
  >(
    `mutation Login($input: LoginInput!) {
      login(input: $input) { ${SESSION_FIELDS} }
    }`,
    { input: { email, password } },
  );
  return data.login;
};

export const registerViaGraphql = async (
  email: string,
  password: string,
  name?: string,
) => {
  const data = await graphqlPublicRequest<
    { register: { success: boolean; message: string; email?: string } },
    { input: { email: string; password: string; name?: string } }
  >(
    `mutation Register($input: RegisterInput!) {
      register(input: $input) { success message email }
    }`,
    { input: { email, password, ...(name ? { name } : {}) } },
  );
  return data.register;
};

export const verifyEmailViaGraphql = async (token: string) => {
  const data = await graphqlPublicRequest<
    { verifyEmail: { success: boolean; user: AuthGraphqlUser } },
    { input: { token: string } }
  >(
    `mutation VerifyEmail($input: VerifyEmailInput!) {
      verifyEmail(input: $input) { ${SESSION_FIELDS} }
    }`,
    { input: { token } },
  );
  return data.verifyEmail;
};

export const resendVerificationViaGraphql = async (email: string) => {
  const data = await graphqlPublicRequest<
    { resendVerificationEmail: { success: boolean; message: string } },
    { input: { email: string } }
  >(
    `mutation ResendVerificationEmail($input: ResendVerificationInput!) {
      resendVerificationEmail(input: $input) { success message }
    }`,
    { input: { email } },
  );
  return data.resendVerificationEmail;
};

export const loginWithGoogleAccessTokenViaGraphql = async (accessToken: string) => {
  const data = await graphqlPublicRequest<
    { loginWithGoogleAccessToken: { success: boolean; user: AuthGraphqlUser } },
    { input: { accessToken: string } }
  >(
    `mutation LoginWithGoogle($input: GoogleAccessTokenInput!) {
      loginWithGoogleAccessToken(input: $input) { ${SESSION_FIELDS} }
    }`,
    { input: { accessToken } },
  );
  return data.loginWithGoogleAccessToken;
};

export const getCurrentUserViaGraphql = async (): Promise<CurrentGraphqlUser> => {
  const data = await graphqlRequest<
    { currentUser: CurrentGraphqlUser },
    Record<string, never>
  >(
    `query CurrentUser {
      currentUser { id email name provider emailVerified role createdAt }
    }`,
    {},
  );
  return data.currentUser;
};

export const logoutViaGraphql = async (): Promise<void> => {
  await graphqlMutationRequest<
    { logout: { success: boolean } },
    Record<string, never>
  >(
    `mutation Logout { logout { success } }`,
    {},
  );
};
