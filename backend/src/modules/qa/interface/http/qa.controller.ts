import { Controller, Get, Param } from '@nestjs/common';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { QaReadinessService } from '../../application/qa-readiness.service';
import { QaEvidenceService } from '../../application/qa-evidence.service';
import { QaTraceabilityService } from '../../application/qa-traceability.service';

@Controller('qa')
export class QaController {
  constructor(
    private readonly qa: QaReadinessService,
    private readonly evidenceSvc: QaEvidenceService,
    private readonly traceabilitySvc: QaTraceabilityService,
  ) {}

  @Get('readiness')
  @RequirePermission('reporting:owner')
  readiness(@CurrentActor() actor: ActorContext) {
    return this.qa.getReadiness(actor);
  }

  @Get('modules')
  @RequirePermission('reporting:owner')
  modules(@CurrentActor() actor: ActorContext) {
    return this.qa.getModules();
  }

  @Get('health')
  @RequirePermission('reporting:owner')
  health(@CurrentActor() actor: ActorContext) {
    return this.qa.getHealth();
  }

  @Get('uat-status')
  @RequirePermission('reporting:owner')
  uatStatus(@CurrentActor() actor: ActorContext) {
    return this.qa.getUatStatus();
  }

  @Get('evidence')
  @RequirePermission('reporting:owner')
  evidence(@CurrentActor() _actor: ActorContext) {
    return this.evidenceSvc.getDashboard();
  }

  @Get('evidence/modules/:module')
  @RequirePermission('reporting:owner')
  evidenceModule(@CurrentActor() _actor: ActorContext, @Param('module') module: string) {
    return this.evidenceSvc.getModuleDetail(module);
  }

  @Get('traceability')
  @RequirePermission('reporting:owner')
  traceability(@CurrentActor() _actor: ActorContext) {
    return this.traceabilitySvc.getDashboard();
  }

  @Get('traceability/rules')
  @RequirePermission('reporting:owner')
  traceabilityRules(@CurrentActor() _actor: ActorContext) {
    return this.traceabilitySvc.getRules();
  }

  @Get('traceability/rules/:module')
  @RequirePermission('reporting:owner')
  traceabilityByModule(@CurrentActor() _actor: ActorContext, @Param('module') module: string) {
    return this.traceabilitySvc.getRulesByModule(module);
  }

  @Get('traceability/orphans')
  @RequirePermission('reporting:owner')
  orphans(@CurrentActor() _actor: ActorContext) {
    return this.traceabilitySvc.getOrphans();
  }

  @Get('traceability/confidence')
  @RequirePermission('reporting:owner')
  confidence(@CurrentActor() _actor: ActorContext) {
    return this.traceabilitySvc.getModuleConfidence();
  }
}
