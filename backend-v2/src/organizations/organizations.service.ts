import { Injectable } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { itemizeGraphqlError } from '../common/graphql-error';
import { Organization } from './organization.types';
import {
  OrganizationRow,
  OrganizationsRepository,
} from './organizations.repository';

@Injectable()
export class OrganizationsService {
  constructor(private readonly organizations: OrganizationsRepository) {}

  async list(userId: number): Promise<Organization[]> {
    try {
      return (await this.organizations.listForUser(userId)).map(this.map);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async select(
    userId: number,
    organizationId: number,
  ): Promise<Organization> {
    this.id(organizationId);
    try {
      const selected = await this.organizations.selectForUser(
        userId,
        organizationId,
      );
      if (!selected) {
        throw itemizeGraphqlError(
          'Organization access is forbidden',
          'FORBIDDEN',
        );
      }
      return this.map(selected);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async ensureDefault(userId: number): Promise<Organization> {
    try {
      const organization =
        await this.organizations.ensureDefaultForUser(userId);
      if (!organization) {
        throw itemizeGraphqlError('User not found', 'NOT_FOUND');
      }
      return this.map(organization);
    } catch (error) {
      this.rethrow(error);
    }
  }

  private id(value: number): void {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw itemizeGraphqlError(
        'Organization ID must be a positive integer',
        'BAD_USER_INPUT',
        { field: 'id', reason: 'INVALID_ORGANIZATION_ID' },
      );
    }
  }

  private readonly map = (row: OrganizationRow): Organization => ({
    id: Number(row.id),
    name: row.name,
    slug: row.slug,
    settings: this.settings(row.settings),
    logoUrl: row.logo_url,
    role: row.role,
    isDefault: row.is_default === true,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  });

  private settings(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  }

  private rethrow(error: unknown): never {
    if (error instanceof GraphQLError) throw error;
    throw itemizeGraphqlError(
      'Organization service is unavailable',
      'SERVICE_UNAVAILABLE',
    );
  }
}
