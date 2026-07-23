import { Module, forwardRef } from '@nestjs/common';
import { EmployeeModule } from '../employee/employee.module';
import { PermissionModule } from '../permission/permission.module';
import { TrainingService } from './application/training.service';
import { TrainingAccessService } from './application/training-access.service';
import { TrainingController } from './interface/http/training.controller';

@Module({
  imports: [forwardRef(() => EmployeeModule), PermissionModule],
  controllers: [TrainingController],
  providers: [TrainingService, TrainingAccessService],
  exports: [TrainingService],
})
export class TrainingModule {}
