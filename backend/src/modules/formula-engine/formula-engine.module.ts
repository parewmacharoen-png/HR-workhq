import { Module } from '@nestjs/common';
import { FormulaDefinitionService, FormulaIntegrationService } from './application/formula-definition.service';
import { FormulaResolverService } from './application/formula-resolver.service';
import { FormulaController } from './interface/http/formula.controller';

@Module({
  controllers: [FormulaController],
  providers: [FormulaDefinitionService, FormulaIntegrationService, FormulaResolverService],
  exports: [FormulaDefinitionService, FormulaIntegrationService, FormulaResolverService],
})
export class FormulaEngineModule {}
