import { Module } from '@nestjs/common';
import { WorkflowWebhooksController } from './workflow-webhooks.controller';
import { WorkflowWebhooksService } from './workflow-webhooks.service';

@Module({
  controllers: [WorkflowWebhooksController],
  providers: [WorkflowWebhooksService],
})
export class WorkflowWebhooksModule {}
