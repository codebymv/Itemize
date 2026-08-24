import { NestFactory } from '@nestjs/core';
import { AdminEmailDeliveryService } from './admin-messaging/admin-email-delivery.service';
import { AppModule } from './app.module';

const run = async (): Promise<void> => {
  const context = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const result = await context.get(AdminEmailDeliveryService).runDue(200);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally { await context.close(); }
};

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
