import { Module } from '@nestjs/common';
import { WorkflowsRepository } from './workflows.repository';
import { WorkflowsResolver } from './workflows.resolver';
import { WorkflowsService } from './workflows.service';

@Module({ providers: [WorkflowsRepository, WorkflowsService, WorkflowsResolver], exports: [WorkflowsRepository, WorkflowsService] })
export class WorkflowsModule {}
