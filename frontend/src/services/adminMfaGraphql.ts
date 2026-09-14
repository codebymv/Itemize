import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';
export type AdminMfaStatus = {
  enrolled: boolean;
  verified: boolean;
  recovery: boolean;
  reauthenticated: boolean;
  sessionRequired: boolean;
  expiresAt: string | null;
};
export type AdminMfaSetup = {
  secret: string;
  qrDataUrl: string;
  expiresAt: string;
};
export async function adminMfaStatus() {
  return (
    await graphqlRequest<
      { adminMfaStatus: AdminMfaStatus },
      Record<string, never>
    >(
      `query AdminMfaStatus { adminMfaStatus { enrolled verified recovery reauthenticated sessionRequired expiresAt } }`,
      {},
    )
  ).adminMfaStatus;
}
export async function reauthenticateAdmin(
  password?: string,
  googleAccessToken?: string,
) {
  return graphqlMutationRequest(
    `mutation ReauthenticateAdmin($password: String, $googleAccessToken: String) {
    reauthenticateAdmin(password: $password, googleAccessToken: $googleAccessToken) }`,
    { password, googleAccessToken },
  );
}
export async function beginAdminMfaSetup() {
  return (
    await graphqlMutationRequest<
      { beginAdminMfaSetup: AdminMfaSetup },
      Record<string, never>
    >(
      `mutation BeginAdminMfaSetup { beginAdminMfaSetup { secret qrDataUrl expiresAt } }`,
      {},
    )
  ).beginAdminMfaSetup;
}
export async function confirmAdminMfaSetup(code: string) {
  return (
    await graphqlMutationRequest<
      { confirmAdminMfaSetup: string[] },
      { code: string }
    >(
      `mutation ConfirmAdminMfaSetup($code: String!) { confirmAdminMfaSetup(code: $code) }`,
      { code },
    )
  ).confirmAdminMfaSetup;
}
export const verifyAdminMfa = (code: string) =>
  graphqlMutationRequest(
    `mutation VerifyAdminMfa($code: String!) { verifyAdminMfa(code: $code) }`,
    { code },
  );
export const recoverAdminMfa = (code: string) =>
  graphqlMutationRequest(
    `mutation RecoverAdminMfa($code: String!) { recoverAdminMfa(code: $code) }`,
    { code },
  );
export const lockAdminMfa = () =>
  graphqlMutationRequest(`mutation LockAdminMfa { lockAdminMfa }`, {});
