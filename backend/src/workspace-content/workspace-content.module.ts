import { Module } from '@nestjs/common';
import { GetStartedModule } from '../get-started/get-started.module';
import { RealtimeOutboxModule } from '../realtime-outbox/realtime-outbox.module';
import { WorkspaceReferencesModule } from '../workspace-references/workspace-references.module';
import { WorkspaceContentRepository } from './workspace-content.repository';
import { WorkspaceContentResolver } from './workspace-content.resolver';
import { WorkspaceContentService } from './workspace-content.service';

@Module({
  imports: [GetStartedModule, RealtimeOutboxModule, WorkspaceReferencesModule],
  providers: [
    WorkspaceContentRepository,
    WorkspaceContentService,
    WorkspaceContentResolver,
  ],
})
export class WorkspaceContentModule {}
