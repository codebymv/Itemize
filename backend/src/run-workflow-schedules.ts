import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { optionalPositiveInteger } from './workflow-jobs/workflow-job.util';
import { WorkflowTriggerJobsService } from './workflow-jobs/workflow-trigger-jobs.service';

const run = async (): Promise<void> => {
  const context = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const result = await context.get(WorkflowTriggerJobsService).runScheduled({
      batchSize: Number(process.env.WORKFLOW_SCHEDULE_BATCH_SIZE || 25),
      workflowId: optionalPositiveInteger(process.env.WORKFLOW_ID),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await context.close();
  }
};

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
