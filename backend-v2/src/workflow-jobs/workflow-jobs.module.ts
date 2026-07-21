import { Module } from '@nestjs/common';
import { WorkflowTriggerJobsRepository } from './workflow-trigger-jobs.repository';
import { WorkflowTriggerJobsService } from './workflow-trigger-jobs.service';
import { WorkflowEnrollmentJobsRepository } from './workflow-enrollment-jobs.repository';
import { WorkflowEnrollmentJobsService } from './workflow-enrollment-jobs.service';

@Module({
  providers: [
    WorkflowEnrollmentJobsRepository,
    WorkflowEnrollmentJobsService,
    WorkflowTriggerJobsRepository,
    WorkflowTriggerJobsService,
  ],
  exports: [WorkflowEnrollmentJobsRepository, WorkflowEnrollmentJobsService, WorkflowTriggerJobsService],
})
export class WorkflowJobsModule {}
