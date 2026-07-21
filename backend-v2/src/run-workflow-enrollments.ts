import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WorkflowEnrollmentJobsService } from './workflow-jobs/workflow-enrollment-jobs.service';
import { optionalPositiveInteger } from './workflow-jobs/workflow-job.util';

const run = async (): Promise<void> => {
  const context = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const result = await context.get(WorkflowEnrollmentJobsService).run({
      batchSize: Number(process.env.WORKFLOW_ENROLLMENT_BATCH_SIZE || 50),
      leaseSeconds: Number(process.env.WORKFLOW_ENROLLMENT_LEASE_SECONDS || 300),
      enrollmentId: optionalPositiveInteger(process.env.WORKFLOW_ENROLLMENT_ID),
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
