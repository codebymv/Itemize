import { Module } from '@nestjs/common';
import { WorkspaceFramesRepository } from './workspace-frames.repository';
import { WorkspaceFramesResolver } from './workspace-frames.resolver';
import { WorkspaceFramesService } from './workspace-frames.service';

/**
 * Frames: named canvas regions with an optional client binding. Cards belong
 * to a frame by geometry, so this module owns only the frame rows themselves;
 * moving a frame with its cards goes through workspace content's position batch.
 */
@Module({
  providers: [
    WorkspaceFramesRepository,
    WorkspaceFramesService,
    WorkspaceFramesResolver,
  ],
  exports: [WorkspaceFramesService],
})
export class WorkspaceFramesModule {}
