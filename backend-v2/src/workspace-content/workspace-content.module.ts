import { Module } from '@nestjs/common';
import { RealtimeOutboxModule } from '../realtime-outbox/realtime-outbox.module';
import { WorkspaceContentRepository } from './workspace-content.repository';
import { WorkspaceContentResolver } from './workspace-content.resolver';
import { WorkspaceContentService } from './workspace-content.service';

@Module({
  imports: [RealtimeOutboxModule],
  providers: [
    WorkspaceContentRepository,
    WorkspaceContentService,
    WorkspaceContentResolver,
  ],
})
export class WorkspaceContentModule {}
