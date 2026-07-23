// ============================================================================
// modules/recruitment/recruitment.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { RecruitmentController } from './interface/http/recruitment.controller';
import { RecruitmentService } from './application/recruitment.service';
import {
  CANDIDATE_REPOSITORY, INTERVIEW_REPOSITORY, OFFER_REPOSITORY,
  PIPELINE_EVENT_REPOSITORY, ANALYTICS_QUERY_REPOSITORY,
} from './domain/repositories/recruitment.repository';
import {
  PrismaCandidateRepository, PrismaInterviewRepository, PrismaOfferRepository,
  PrismaPipelineEventRepository, PrismaAnalyticsQueryRepository,
} from './infrastructure/persistence/recruitment.prisma.repository';

@Module({
  controllers: [RecruitmentController],
  providers: [
    RecruitmentService,
    { provide: CANDIDATE_REPOSITORY,        useClass: PrismaCandidateRepository },
    { provide: INTERVIEW_REPOSITORY,        useClass: PrismaInterviewRepository },
    { provide: OFFER_REPOSITORY,            useClass: PrismaOfferRepository },
    { provide: PIPELINE_EVENT_REPOSITORY,   useClass: PrismaPipelineEventRepository },
    { provide: ANALYTICS_QUERY_REPOSITORY,  useClass: PrismaAnalyticsQueryRepository },
  ],
  exports: [RecruitmentService],
})
export class RecruitmentModule {}
