import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { optionalPositiveInteger } from './workflow-jobs/workflow-job.util';
import { WorkflowTriggerJobsService } from './workflow-jobs/workflow-trigger-jobs.service';

const run = async (): Promise<void> => {
  const context = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const result = await context.get(WorkflowTriggerJobsService).runTriggers({
      batchSize: Number(process.env.WORKFLOW_TRIGGER_BATCH_SIZE || 25),
      leaseSeconds: Number(process.env.WORKFLOW_TRIGGER_LEASE_SECONDS || 300),
      maxAttempts: Number(process.env.WORKFLOW_TRIGGER_MAX_ATTEMPTS || 5),
      baseDelayMs: Number(process.env.WORKFLOW_TRIGGER_RETRY_BASE_MS || 60_000),
      maximumDelayMs: Number(process.env.WORKFLOW_TRIGGER_RETRY_MAX_MS || 86_400_000),
      triggerId: optionalPositiveInteger(process.env.WORKFLOW_TRIGGER_ID),
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
