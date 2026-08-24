import { Inject, Injectable } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { Pool } from 'pg';
import { itemizeGraphqlError } from '../common/graphql-error';
import { PG_POOL } from '../database/database.module';
import { OrganizationIdentity } from '../request-context/request-context.types';

type OrganizationRow = {
  organization_id?: number | string | null;
  default_organization_id?: number | string | null;
  role?: string | null;
};

@Injectable()
export class OrganizationContextService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async resolve(
    userId: number,
    requestedOrganizationId: string | string[] | undefined,
  ): Promise<OrganizationIdentity> {
    const explicitId = this.parseOrganizationId(requestedOrganizationId);

    try {
      if (explicitId !== null) {
        const membership = await this.pool.query<OrganizationRow>(
          `SELECT organization_id, role
           FROM organization_members
           WHERE organization_id = $1 AND user_id = $2`,
          [explicitId, userId],
        );
        const row = membership.rows[0];
        if (!row?.role) {
          throw itemizeGraphqlError(
            'Organization access is forbidden',
            'FORBIDDEN',
          );
        }
        return {
          organizationId: explicitId,
          organizationRole: row.role,
        };
      }

      const defaultMembership = await this.pool.query<OrganizationRow>(
        `SELECT u.default_organization_id, om.role
         FROM users u
         LEFT JOIN organization_members om
           ON om.organization_id = u.default_organization_id
          AND om.user_id = u.id
         WHERE u.id = $1`,
        [userId],
      );
      const row = defaultMembership.rows[0];
      if (!row?.default_organization_id) {
        throw itemizeGraphqlError(
          'Select an organization to continue',
          'ORGANIZATION_REQUIRED',
        );
      }
      if (!row.role) {
        throw itemizeGraphqlError(
          'Organization access is forbidden',
          'FORBIDDEN',
        );
      }

      return {
        organizationId: Number(row.default_organization_id),
        organizationRole: row.role,
      };
    } catch (error) {
      if (error instanceof GraphQLError) throw error;
      throw itemizeGraphqlError(
        'Organization service is unavailable',
        'SERVICE_UNAVAILABLE',
      );
    }
  }

  private parseOrganizationId(
    value: string | string[] | undefined,
  ): number | null {
    if (value === undefined || value === '') return null;
    if (Array.isArray(value) || !/^[1-9]\d*$/.test(value.trim())) {
      throw itemizeGraphqlError(
        'Organization ID must be a positive integer',
        'BAD_USER_INPUT',
        { reason: 'INVALID_ORGANIZATION_ID', field: 'x-organization-id' },
      );
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
      throw itemizeGraphqlError(
        'Organization ID must be a positive integer',
        'BAD_USER_INPUT',
        { reason: 'INVALID_ORGANIZATION_ID', field: 'x-organization-id' },
      );
    }
    return parsed;
  }
}
