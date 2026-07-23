import { Module, forwardRef } from '@nestjs/common';
import { PermissionModule } from '../permission/permission.module';
import { TelegramModule } from '../telegram/telegram.module';
import { TeamCalendarService } from './application/team-calendar.service';
import { TeamCalendarScopeService } from './application/team-calendar-scope.service';
import { TeamLeaveConflictService } from './application/team-leave-conflict.service';
import { TeamCalendarController } from './interface/http/team-calendar.controller';
import { TeamCalendarTelegramHandler } from './application/team-calendar.handler';

@Module({
  imports: [PermissionModule, forwardRef(() => TelegramModule)],
  controllers: [TeamCalendarController],
  providers: [
    TeamCalendarService,
    TeamCalendarScopeService,
    TeamLeaveConflictService,
    TeamCalendarTelegramHandler,
  ],
  exports: [TeamCalendarService, TeamCalendarScopeService, TeamLeaveConflictService, TeamCalendarTelegramHandler],
})
export class CalendarModule {}
