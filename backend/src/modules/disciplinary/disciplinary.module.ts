// ============================================================================
// modules/disciplinary/disciplinary.module.ts
// ============================================================================

import { Module, forwardRef } from '@nestjs/common';
import { EmployeeModule } from '../employee/employee.module';
import { PermissionModule } from '../permission/permission.module';
import { TelegramModule } from '../telegram/telegram.module';
import { ExitModule } from '../exit/exit.module';
import { DisciplinaryActionService } from './application/disciplinary-action.service';
import { DisciplinaryTelegramNotifier } from './application/disciplinary-telegram.notifier';
import { DisciplinaryController } from './interface/http/disciplinary.controller';

@Module({
  imports: [
    forwardRef(() => EmployeeModule),
    PermissionModule,
    forwardRef(() => TelegramModule),
    forwardRef(() => ExitModule),
  ],
  controllers: [DisciplinaryController],
  providers: [DisciplinaryActionService, DisciplinaryTelegramNotifier],
  exports: [DisciplinaryActionService],
})
export class DisciplinaryModule {}
