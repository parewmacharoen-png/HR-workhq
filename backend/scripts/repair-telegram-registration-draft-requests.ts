/**
 * Submit draft telegram_registration_review requests into approval workflow.
 *
 * Usage (from repo root, with DATABASE_URL set):
 *   npx ts-node -r tsconfig-paths/register backend/scripts/repair-telegram-registration-draft-requests.ts
 *   npx ts-node -r tsconfig-paths/register backend/scripts/repair-telegram-registration-draft-requests.ts --dry-run
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { TelegramRegistrationRequestBridgeService } from '../src/modules/request/application/telegram-registration-request-bridge.service';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const bridge = app.get(TelegramRegistrationRequestBridgeService);

  if (dryRun) {
    console.log('Dry run — listing would repair via bridge.repairDraftRequests()');
    await app.close();
    return;
  }

  const result = await bridge.repairDraftRequests();
  console.log(`Repaired: ${result.repaired.length}`, result.repaired);
  if (result.failed.length) {
    console.warn(`Failed: ${result.failed.length}`, result.failed);
    process.exitCode = 1;
  }
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
