/**
 * Repair telegram onboarding Approval Center requests.
 *
 * Usage (from repo root, with DATABASE_URL set):
 *   npm run repair:telegram-onboarding-requests
 *   npm run repair:telegram-onboarding-requests -- --dry-run
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { TelegramRegistrationRequestBridgeService } from '../src/modules/request/application/telegram-registration-request-bridge.service';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const bridge = app.get(TelegramRegistrationRequestBridgeService);

  if (dryRun) {
    console.log('Dry run — would call bridge.repairOnboardingRequests()');
    await app.close();
    return;
  }

  const result = await bridge.repairOnboardingRequests();
  console.log('Drafts repaired:', result.draftsRepaired.length, result.draftsRepaired);
  if (result.draftsFailed.length) {
    console.warn('Draft repair failed:', result.draftsFailed.length, result.draftsFailed);
  }
  console.log('Backfilled requests:', result.backfilled.length, result.backfilled);
  if (result.backfillFailed.length) {
    console.warn('Backfill failed:', result.backfillFailed.length, result.backfillFailed);
    process.exitCode = 1;
  }
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
