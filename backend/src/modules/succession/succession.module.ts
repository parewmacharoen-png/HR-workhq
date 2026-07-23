import { Module, forwardRef } from '@nestjs/common';
import { EmployeeModule } from '../employee/employee.module';
import { SuccessionService } from './application/succession.service';
import { SuccessionController } from './interface/http/succession.controller';

@Module({
  imports: [forwardRef(() => EmployeeModule)],
  controllers: [SuccessionController],
  providers: [SuccessionService],
  exports: [SuccessionService],
})
export class SuccessionModule {}
