import { Module } from '@nestjs/common';
import { WorkspaceReferencesRepository } from './workspace-references.repository';
import { WorkspaceReferencesResolver } from './workspace-references.resolver';
import { WorkspaceReferencesService } from './workspace-references.service';

/**
 * Inline references from workspace cards to clients and money documents.
 * Imported by workspace content (write on save, hydrate on read) and by the
 * sales document editor (back-trace on an invoice or estimate).
 */
@Module({
  providers: [
    WorkspaceReferencesRepository,
    WorkspaceReferencesService,
    WorkspaceReferencesResolver,
  ],
  exports: [WorkspaceReferencesService],
})
export class WorkspaceReferencesModule {}
