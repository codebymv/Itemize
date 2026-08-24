import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RecurringInvoicesService } from './recurring-invoices/recurring-invoices.service';

async function run(): Promise<void> {
  const logger = new Logger('RecurringInvoiceGeneration');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const rawBatchSize = process.env.RECURRING_INVOICE_BATCH_SIZE ?? '100';
    const batchSize = Number(rawBatchSize);
    const result = await app.get(RecurringInvoicesService).generateDue(batchSize);
    logger.log(JSON.stringify({
      candidates: result.candidates,
      generated: result.generated.length,
      replayed: result.replayed,
      skipped: result.skipped,
      failures: result.failures,
    }));
    if (result.failures.length > 0) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void run().catch((error: unknown) => {
  const logger = new Logger('RecurringInvoiceGeneration');
  logger.error(error instanceof Error ? error.message : 'Recurring generation failed');
  process.exitCode = 1;
});
