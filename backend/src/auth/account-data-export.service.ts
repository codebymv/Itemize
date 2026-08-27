import { Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';
import { AccountDataExportRepository } from './account-data-export.repository';
import { AccountDataExport } from './account-data-export.types';

@Injectable()
export class AccountDataExportService {
  constructor(private readonly exports: AccountDataExportRepository) {}

  async exportForUser(userId: number): Promise<AccountDataExport> {
    const data = await this.exports.exportForUser(userId);
    if (!data) throw itemizeGraphqlError('User not found', 'NOT_FOUND');

    const generatedAt = new Date();
    return {
      schemaVersion: 1,
      generatedAt,
      filename: `itemize-account-export-${generatedAt.toISOString().slice(0, 10)}.json`,
      data,
    };
  }
}
