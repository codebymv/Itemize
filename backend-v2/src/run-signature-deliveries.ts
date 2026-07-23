import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SignatureDeliveryJobsService } from './signature-delivery/signature-delivery-jobs.service';
import { optionalPositiveInteger } from './workflow-jobs/workflow-job.util';

const run = async (): Promise<void> => {
  const context = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const result = await context.get(SignatureDeliveryJobsService).run({
      batchSize: Number(process.env.SIGNATURE_DELIVERY_BATCH_SIZE || 25),
      reminderBatchSize: Number(process.env.SIGNATURE_REMINDER_BATCH_SIZE || 25),
      leaseSeconds: Number(process.env.SIGNATURE_DELIVERY_LEASE_SECONDS || 300),
      maxAttempts: Number(process.env.SIGNATURE_DELIVERY_MAX_ATTEMPTS || 5),
      baseDelayMs: Number(process.env.SIGNATURE_DELIVERY_RETRY_BASE_MS || 60_000),
      maximumDelayMs: Number(process.env.SIGNATURE_DELIVERY_RETRY_MAX_MS || 86_400_000),
      outboxId: optionalPositiveInteger(process.env.SIGNATURE_DELIVERY_ID),
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
