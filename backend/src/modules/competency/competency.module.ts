import { Module, forwardRef } from '@nestjs/common';
import { EmployeeModule } from '../employee/employee.module';
import { CompetencyService } from './application/competency.service';
import { CompetencyController } from './interface/http/competency.controller';

@Module({
  imports: [forwardRef(() => EmployeeModule)],
  controllers: [CompetencyController],
  providers: [CompetencyService],
  exports: [CompetencyService],
})
export class CompetencyModule {}
