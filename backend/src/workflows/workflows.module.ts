import { Module } from '@nestjs/common';
import { WorkflowsRepository } from './workflows.repository';
import { WorkflowsResolver } from './workflows.resolver';
import { WorkflowsService } from './workflows.service';
import { WorkflowEnrollmentsRepository } from './workflow-enrollments.repository';
import { WorkflowEnrollmentsResolver } from './workflow-enrollments.resolver';
import { WorkflowEnrollmentsService } from './workflow-enrollments.service';

@Module({
  providers: [
    WorkflowsRepository, WorkflowsService, WorkflowsResolver,
    WorkflowEnrollmentsRepository, WorkflowEnrollmentsService, WorkflowEnrollmentsResolver,
  ],
  exports: [WorkflowsRepository, WorkflowsService, WorkflowEnrollmentsRepository, WorkflowEnrollmentsService],
})
export class WorkflowsModule {}
