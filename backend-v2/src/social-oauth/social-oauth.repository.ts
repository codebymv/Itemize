/**
 * Faithful port of the retained Facebook OAuth persistence
 * (backend/src/routes/social/oauth.routes.js): the single-use expiring
 * database state and the batched social channel upserts.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { FacebookPage } from './facebook-graph.provider';

@Injectable()
export class SocialOAuthRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async storeState(values: {
    state: string;
    organizationId: number;
    userId: number;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO oauth_states (state, organization_id, user_id, provider, expires_at)
       VALUES ($1, $2, $3, 'facebook', NOW() + INTERVAL '10 minutes')
       ON CONFLICT (state) DO UPDATE SET
         organization_id = EXCLUDED.organization_id,
         user_id = EXCLUDED.user_id,
         expires_at = EXCLUDED.expires_at`,
      [values.state, values.organizationId, values.userId],
    );
  }

  async claimState(
    state: string,
  ): Promise<{ organizationId: number; userId: number } | null> {
    const result = await this.pool.query<{
      organization_id: number;
      user_id: number;
    }>(
      `SELECT organization_id, user_id FROM oauth_states
       WHERE state = $1 AND provider = 'facebook' AND expires_at > NOW()`,
      [state],
    );
    if (result.rows.length === 0) return null;
    await this.pool.query('DELETE FROM oauth_states WHERE state = $1', [state]);
    return {
      organizationId: result.rows[0].organization_id,
      userId: result.rows[0].user_id,
    };
  }

  async saveChannels(values: {
    organizationId: number;
    userId: number;
    pages: FacebookPage[];
    providerUserId: string | null;
    userAccessToken: string;
  }): Promise<void> {
    const pages = values.pages || [];
    if (pages.length === 0) return;

    const fbData = pages.map((page) => [
      values.organizationId,
      'facebook',
      page.id,
      page.name,
      page.name,
      page.id,
      page.access_token,
      values.providerUserId,
      values.userAccessToken,
      true,
      values.userId,
    ]);
    const igData = pages
      .filter((page) => page.instagram_business_account)
      .map((page) => {
        const ig = page.instagram_business_account as NonNullable<
          FacebookPage['instagram_business_account']
        >;
        return [
          values.organizationId,
          'instagram',
          ig.id,
          ig.username || 'Instagram',
          ig.username,
          ig.profile_picture_url,
          ig.id,
          page.id,
          page.access_token,
          values.providerUserId,
          values.userAccessToken,
          true,
          values.userId,
        ];
      });

    if (fbData.length > 0) {
      await this.pool.query(
        `INSERT INTO social_channels (
           organization_id, channel_type, external_id, name, username,
           page_id, page_access_token, user_id, user_access_token,
           is_connected, created_by
         )
         SELECT
           organization_id, channel_type, external_id, name, username,
           page_id, page_access_token, user_id, user_access_token,
           is_connected, created_by
         FROM UNNEST(
           $1::int[], $2::varchar[], $3::varchar[], $4::varchar[], $5::varchar[],
           $6::varchar[], $7::text[], $8::varchar[], $9::text[], $10::boolean[], $11::int[]
         ) AS channels(
           organization_id, channel_type, external_id, name, username,
           page_id, page_access_token, user_id, user_access_token,
           is_connected, created_by
         )
         ON CONFLICT (organization_id, channel_type, external_id) DO UPDATE SET
           name = EXCLUDED.name,
           page_access_token = EXCLUDED.page_access_token,
           user_access_token = EXCLUDED.user_access_token,
           is_connected = TRUE,
           connection_error = NULL,
           updated_at = CURRENT_TIMESTAMP`,
        [
          fbData.map((d) => d[0]),
          fbData.map((d) => d[1]),
          fbData.map((d) => d[2]),
          fbData.map((d) => d[3]),
          fbData.map((d) => d[4]),
          fbData.map((d) => d[5]),
          fbData.map((d) => d[6]),
          fbData.map((d) => d[7]),
          fbData.map((d) => d[8]),
          fbData.map((d) => d[9]),
          fbData.map((d) => d[10]),
        ],
      );
    }

    if (igData.length > 0) {
      await this.pool.query(
        `INSERT INTO social_channels (
           organization_id, channel_type, external_id, name, username,
           profile_picture_url, instagram_business_account_id,
           page_id, page_access_token, user_id, user_access_token,
           is_connected, created_by
         )
         SELECT
           organization_id, channel_type, external_id, name, username,
           profile_picture_url, instagram_business_account_id,
           page_id, page_access_token, user_id, user_access_token,
           is_connected, created_by
         FROM UNNEST(
           $1::int[], $2::varchar[], $3::varchar[], $4::varchar[], $5::varchar[],
           $6::text[], $7::varchar[], $8::varchar[], $9::text[], $10::varchar[],
           $11::text[], $12::boolean[], $13::int[]
         ) AS channels(
           organization_id, channel_type, external_id, name, username,
           profile_picture_url, instagram_business_account_id,
           page_id, page_access_token, user_id, user_access_token,
           is_connected, created_by
         )
         ON CONFLICT (organization_id, channel_type, external_id) DO UPDATE SET
           name = EXCLUDED.name,
           username = EXCLUDED.username,
           profile_picture_url = EXCLUDED.profile_picture_url,
           page_access_token = EXCLUDED.page_access_token,
           user_access_token = EXCLUDED.user_access_token,
           is_connected = TRUE,
           connection_error = NULL,
           updated_at = CURRENT_TIMESTAMP`,
        [
          igData.map((d) => d[0]),
          igData.map((d) => d[1]),
          igData.map((d) => d[2]),
          igData.map((d) => d[3]),
          igData.map((d) => d[4]),
          igData.map((d) => d[5]),
          igData.map((d) => d[6]),
          igData.map((d) => d[7]),
          igData.map((d) => d[8]),
          igData.map((d) => d[9]),
          igData.map((d) => d[10]),
          igData.map((d) => d[11]),
          igData.map((d) => d[12]),
        ],
      );
    }
  }
}
