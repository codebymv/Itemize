import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ReputationRequestDeliveryService } from './reputation-requests/reputation-request-delivery.service';

const run = async (): Promise<void> => {
  const context = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const result = await context.get(ReputationRequestDeliveryService).runDue(200);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally { await context.close(); }
};

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
