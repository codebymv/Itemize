/**
 * Faithful port of the retained Facebook Graph calls used by the OAuth
 * connection flow (backend/src/routes/social/oauth.routes.js).
 */
export const FACEBOOK_GRAPH_CLIENT = Symbol('FACEBOOK_GRAPH_CLIENT');

const FB_GRAPH_API = 'https://graph.facebook.com/v18.0';

export type FacebookPage = {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: {
    id: string;
    username?: string;
    profile_picture_url?: string;
  };
};

export type FacebookTokenResult = {
  access_token?: string;
  error?: unknown;
};

export type FacebookPagesResult = {
  data?: FacebookPage[];
  error?: unknown;
};

export type FacebookMeResult = { id?: string; error?: unknown };

export interface FacebookGraphClient {
  exchangeCode(values: {
    appId: string;
    appSecret: string;
    redirectUri: string;
    code: string;
  }): Promise<FacebookTokenResult>;
  getPages(userAccessToken: string): Promise<FacebookPagesResult>;
  getMe(userAccessToken: string): Promise<FacebookMeResult>;
}

export class HttpFacebookGraphClient implements FacebookGraphClient {
  async exchangeCode(values: {
    appId: string;
    appSecret: string;
    redirectUri: string;
    code: string;
  }): Promise<FacebookTokenResult> {
    const response = await fetch(
      `${FB_GRAPH_API}/oauth/access_token?client_id=${values.appId}&redirect_uri=${encodeURIComponent(values.redirectUri)}&client_secret=${values.appSecret}&code=${values.code}`,
    );
    return (await response.json()) as FacebookTokenResult;
  }

  async getPages(userAccessToken: string): Promise<FacebookPagesResult> {
    const response = await fetch(
      `${FB_GRAPH_API}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,profile_picture_url}&access_token=${userAccessToken}`,
    );
    return (await response.json()) as FacebookPagesResult;
  }

  async getMe(userAccessToken: string): Promise<FacebookMeResult> {
    const response = await fetch(
      `${FB_GRAPH_API}/me?access_token=${userAccessToken}`,
    );
    return (await response.json()) as FacebookMeResult;
  }
}
