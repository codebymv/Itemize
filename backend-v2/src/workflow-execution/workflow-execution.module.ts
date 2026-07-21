import { Module } from '@nestjs/common';
import { WorkflowExecutionRepository } from './workflow-execution.repository';
import { WorkflowExecutionResolver } from './workflow-execution.resolver';
import { WorkflowExecutionService } from './workflow-execution.service';

@Module({ providers:[WorkflowExecutionRepository,WorkflowExecutionService,WorkflowExecutionResolver] })
export class WorkflowExecutionModule {}
