import { Module } from '@nestjs/common';
import { WorkflowTriggerJobsRepository } from './workflow-trigger-jobs.repository';
import { WorkflowTriggerJobsService } from './workflow-trigger-jobs.service';

@Module({
  providers: [WorkflowTriggerJobsRepository, WorkflowTriggerJobsService],
  exports: [WorkflowTriggerJobsService],
})
export class WorkflowJobsModule {}
