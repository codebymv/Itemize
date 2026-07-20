import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { EstimateEmailDeliveryService } from './estimates/estimate-email-delivery.service';

async function main(): Promise<void> {
  const context = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const result = await context.get(EstimateEmailDeliveryService).runDue(100);
    console.log(JSON.stringify(result));
  } finally {
    await context.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
