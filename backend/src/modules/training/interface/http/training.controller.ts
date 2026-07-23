// ============================================================================
// modules/training/interface/http/training.controller.ts
// ============================================================================

import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { TrainingService } from '../../application/training.service';
import {
  AssignTrainingDto,
  CompleteLessonDto,
  CreateTrainingCourseDto,
  SubmitQuizDto,
  UpdateTrainingCourseDto,
} from '../../application/dto/training.dto';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';

@Controller('training')
export class TrainingController {
  constructor(private readonly service: TrainingService) {}

  @Get('courses')
  @RequirePermission('employee:read')
  listCourses(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId?: string,
  ) {
    return this.service.listCourses(actor, companyId);
  }

  @Get('dashboard')
  @RequirePermission('employee:read')
  dashboard(@CurrentActor() actor: ActorContext, @Query('companyId') companyId: string) {
    return this.service.getDashboard(actor, companyId);
  }

  @Post('courses')
  @RequirePermission('employee:write')
  create(@CurrentActor() actor: ActorContext, @Body() dto: CreateTrainingCourseDto) {
    return this.service.createCourse(actor, dto);
  }

  @Put('courses/:id')
  @RequirePermission('employee:write')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: UpdateTrainingCourseDto,
  ) {
    return this.service.updateCourse(actor, id, dto);
  }

  @Post('courses/:id/publish')
  @RequirePermission('employee:write')
  publish(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.publishCourse(actor, id);
  }

  @Post('courses/:id/archive')
  @RequirePermission('employee:write')
  archive(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.archiveCourse(actor, id);
  }

  @Post('assignments')
  @RequirePermission('employee:write')
  assign(@CurrentActor() actor: ActorContext, @Body() dto: AssignTrainingDto) {
    return this.service.assignCourse(actor, dto);
  }

  @Get('employees/:employeeId/assignments')
  @RequirePermission('employee:read')
  myAssignments(
    @CurrentActor() actor: ActorContext,
    @Param('employeeId') employeeId: string,
  ) {
    return this.service.listMyAssignments(actor, employeeId);
  }

  @Post('assignments/:id/complete-lesson')
  @RequirePermission('employee:read')
  completeLesson(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: CompleteLessonDto,
  ) {
    return this.service.completeLesson(actor, id, dto);
  }

  @Post('assignments/:id/submit-quiz')
  @RequirePermission('employee:read')
  submitQuiz(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: SubmitQuizDto,
  ) {
    return this.service.submitQuiz(actor, id, dto);
  }
}
