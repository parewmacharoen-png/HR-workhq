import { Module, forwardRef } from '@nestjs/common';
import { PermissionModule } from '../permission/permission.module';
import { TelegramModule } from '../telegram/telegram.module';
import { AnnouncementController } from './interface/http/announcement.controller';
import { AnnouncementService } from './application/announcement.service';
import { AnnouncementTelegramHandler } from './application/announcement.handler';
import { AnnouncementReminderScheduler } from './application/announcement-reminder.scheduler';
import { AnnouncementReminderNotifier } from './application/announcement-reminder.notifier';

@Module({
  imports: [PermissionModule, forwardRef(() => TelegramModule)],
  controllers: [AnnouncementController],
  providers: [
    AnnouncementService,
    AnnouncementTelegramHandler,
    AnnouncementReminderScheduler,
    AnnouncementReminderNotifier,
  ],
  exports: [AnnouncementService, AnnouncementTelegramHandler],
})
export class AnnouncementModule {}
