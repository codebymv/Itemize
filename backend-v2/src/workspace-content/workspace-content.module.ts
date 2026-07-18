import { Module } from '@nestjs/common';
import { WorkspaceContentRepository } from './workspace-content.repository';
import { WorkspaceContentResolver } from './workspace-content.resolver';
import { WorkspaceContentService } from './workspace-content.service';

@Module({
  providers: [
    WorkspaceContentRepository,
    WorkspaceContentService,
    WorkspaceContentResolver,
  ],
})
export class WorkspaceContentModule {}
