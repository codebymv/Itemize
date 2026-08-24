import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { CampaignTestEmailService } from './campaign-delivery/campaign-test-email.service';

const run = async (): Promise<void> => {
  const context = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const result = await context.get(CampaignTestEmailService).runDue(100);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await context.close();
  }
};

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
