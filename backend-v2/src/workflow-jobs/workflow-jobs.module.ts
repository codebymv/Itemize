import { Module } from '@nestjs/common';
import { WorkflowTriggerJobsRepository } from './workflow-trigger-jobs.repository';
import { WorkflowTriggerJobsService } from './workflow-trigger-jobs.service';
import { WorkflowEnrollmentJobsRepository } from './workflow-enrollment-jobs.repository';
import { WorkflowEnrollmentJobsService } from './workflow-enrollment-jobs.service';
import {
  ControlledWorkflowWebhookProvider,
  ResendWorkflowEmailProvider,
  TwilioWorkflowSmsProvider,
  WORKFLOW_EMAIL_PROVIDER,
  WORKFLOW_SMS_PROVIDER,
  WORKFLOW_WEBHOOK_PROVIDER,
} from './workflow-side-effect.providers';
import { WorkflowSideEffectJobsRepository } from './workflow-side-effect-jobs.repository';
import { WorkflowSideEffectJobsService } from './workflow-side-effect-jobs.service';
import { WorkflowJobsSchedulerService } from './workflow-jobs-scheduler.service';

@Module({
  providers: [
    WorkflowEnrollmentJobsRepository,
    WorkflowEnrollmentJobsService,
    WorkflowTriggerJobsRepository,
    WorkflowTriggerJobsService,
    WorkflowSideEffectJobsRepository,
    WorkflowSideEffectJobsService,
    WorkflowJobsSchedulerService,
    ResendWorkflowEmailProvider,
    TwilioWorkflowSmsProvider,
    ControlledWorkflowWebhookProvider,
    { provide: WORKFLOW_EMAIL_PROVIDER, useExisting: ResendWorkflowEmailProvider },
    { provide: WORKFLOW_SMS_PROVIDER, useExisting: TwilioWorkflowSmsProvider },
    { provide: WORKFLOW_WEBHOOK_PROVIDER, useExisting: ControlledWorkflowWebhookProvider },
  ],
  exports: [WorkflowEnrollmentJobsRepository, WorkflowEnrollmentJobsService, WorkflowTriggerJobsService,
    WorkflowSideEffectJobsRepository, WorkflowSideEffectJobsService],
})
export class WorkflowJobsModule {}
