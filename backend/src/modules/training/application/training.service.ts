// ============================================================================
// modules/training/application/training.service.ts
// TRAIN-001 — Training library & learning tracking
// ============================================================================

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { DateProvider } from '../../../shared/time/date.provider';
import { TrainingAccessService } from './training-access.service';
import {
  AssignTrainingDto,
  CompleteLessonDto,
  CreateTrainingCourseDto,
  SubmitQuizDto,
  UpdateTrainingCourseDto,
} from './dto/training.dto';

@Injectable()
export class TrainingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: TrainingAccessService,
    private readonly dates: DateProvider,
  ) {}

  async listCourses(actor: ActorContext, companyId?: string | null) {
    await this.access.assertCanView(actor, companyId ?? null);
    return this.prisma.trainingCourse.findMany({
      where: {
        deletedAt: null,
        ...(companyId ? { OR: [{ companyId }, { companyId: null }] } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  }

  async getDashboard(actor: ActorContext, companyId: string) {
    await this.access.assertCanView(actor, companyId);
    const [overdue, totalAssignments, completed, draftCourses] = await Promise.all([
      this.prisma.trainingAssignment.count({
        where: {
          status: 'overdue',
          deletedAt: null,
          course: { companyId },
        },
      }),
      this.prisma.trainingAssignment.count({
        where: { deletedAt: null, course: { companyId } },
      }),
      this.prisma.trainingAssignment.count({
        where: { status: 'completed', deletedAt: null, course: { companyId } },
      }),
      this.prisma.trainingCourse.count({
        where: { status: 'draft', deletedAt: null, companyId },
      }),
    ]);
    const completionRate = totalAssignments > 0
      ? Math.round((completed / totalAssignments) * 100)
      : 100;
    return { overdue, completionRate, draftCourses, totalAssignments, completed };
  }

  async createCourse(actor: ActorContext, dto: CreateTrainingCourseDto) {
    await this.access.assertCanManage(actor, dto.companyId ?? null);
    const code = dto.code ?? `TRN-${randomUUID().slice(0, 6).toUpperCase()}`;
    const course = await this.prisma.trainingCourse.create({
      data: {
        code,
        title: dto.title,
        description: dto.description,
        category: dto.category,
        companyId: dto.companyId,
        isMandatory: dto.isMandatory ?? false,
        status: 'draft',
        createdBy: actor.userId,
        updatedBy: actor.userId,
        lessons: dto.lessons?.length
          ? {
              create: dto.lessons.map((l, i) => ({
                title: l.title,
                contentType: l.contentType,
                contentJson: l.contentJson as Prisma.InputJsonValue,
                sortOrder: l.sortOrder ?? i,
              })),
            }
          : undefined,
      },
      include: { lessons: true },
    });
    await this.audit.record(actor, {
      entityType: 'TrainingCourse',
      entityId: course.id,
      action: 'create',
      after: course,
    });
    return course;
  }

  async updateCourse(actor: ActorContext, id: string, dto: UpdateTrainingCourseDto) {
    const existing = await this.prisma.trainingCourse.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new Error('Course not found');
    await this.access.assertCanManage(actor, existing.companyId);
    const course = await this.prisma.trainingCourse.update({
      where: { id },
      data: {
        title: dto.title ?? existing.title,
        description: dto.description ?? existing.description,
        category: dto.category ?? existing.category,
        isMandatory: dto.isMandatory ?? existing.isMandatory,
        updatedBy: actor.userId,
      },
    });
    await this.audit.record(actor, {
      entityType: 'TrainingCourse',
      entityId: id,
      action: 'update',
      before: existing,
      after: course,
    });
    return course;
  }

  async publishCourse(actor: ActorContext, id: string) {
    const existing = await this.prisma.trainingCourse.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new Error('Course not found');
    await this.access.assertCanManage(actor, existing.companyId);
    const course = await this.prisma.trainingCourse.update({
      where: { id },
      data: { status: 'published', publishedAt: this.dates.now(), updatedBy: actor.userId },
    });
    await this.audit.record(actor, { entityType: 'TrainingCourse', entityId: id, action: 'publish' });
    return course;
  }

  async archiveCourse(actor: ActorContext, id: string) {
    const existing = await this.prisma.trainingCourse.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new Error('Course not found');
    await this.access.assertCanManage(actor, existing.companyId);
    const course = await this.prisma.trainingCourse.update({
      where: { id },
      data: { status: 'archived', updatedBy: actor.userId },
    });
    await this.audit.record(actor, { entityType: 'TrainingCourse', entityId: id, action: 'archive' });
    return course;
  }

  async assignCourse(actor: ActorContext, dto: AssignTrainingDto) {
    await this.access.assertCanManage(actor, dto.companyId);
    const created = [];
    for (const employeeId of dto.employeeIds) {
      const existing = await this.prisma.trainingAssignment.findFirst({
        where: { courseId: dto.courseId, employeeId, deletedAt: null },
      });
      const row = existing
        ? await this.prisma.trainingAssignment.update({
            where: { id: existing.id },
            data: {
              dueDate: dto.dueDate ? new Date(dto.dueDate) : existing.dueDate,
              status: 'assigned',
              assignedBy: actor.userId,
              updatedBy: actor.userId,
            },
          })
        : await this.prisma.trainingAssignment.create({
            data: {
              courseId: dto.courseId,
              employeeId,
              assignedBy: actor.userId,
              dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
              status: 'assigned',
              createdBy: actor.userId,
            },
          });
      created.push(row);
    }
    await this.audit.record(actor, {
      entityType: 'TrainingAssignment',
      entityId: dto.courseId,
      action: 'assign',
      after: { count: created.length },
    });
    return created;
  }

  async listMyAssignments(actor: ActorContext, employeeId: string) {
    return this.prisma.trainingAssignment.findMany({
      where: { employeeId, deletedAt: null },
      include: { course: { include: { lessons: { orderBy: { sortOrder: 'asc' } } } } },
      orderBy: { assignedAt: 'desc' },
    });
  }

  async completeLesson(actor: ActorContext, assignmentId: string, dto: CompleteLessonDto) {
    const assignment = await this.prisma.trainingAssignment.findFirst({
      where: { id: assignmentId, deletedAt: null },
    });
    if (!assignment) throw new Error('Assignment not found');

    await this.prisma.trainingAssignment.update({
      where: { id: assignmentId },
      data: {
        status: 'in_progress',
        updatedBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'TrainingAssignment',
      entityId: assignmentId,
      action: 'lesson_completed',
      after: { lessonId: dto.lessonId },
    });

    const lessons = await this.prisma.trainingLesson.count({
      where: { courseId: assignment.courseId },
    });
    if (dto.markCourseComplete || lessons <= 1) {
      return this.markCompleted(actor, assignmentId);
    }
    return this.prisma.trainingAssignment.findUnique({ where: { id: assignmentId } });
  }

  async submitQuiz(actor: ActorContext, assignmentId: string, dto: SubmitQuizDto) {
    const assignment = await this.prisma.trainingAssignment.findFirst({
      where: { id: assignmentId, deletedAt: null },
      include: { course: { include: { quizzes: true } } },
    });
    if (!assignment) throw new Error('Assignment not found');
    const quiz = assignment.course.quizzes[0];
    if (!quiz) throw new Error('No quiz for course');

    const questions = quiz.questionsJson as Array<{ id: string; correct: string }>;
    let correct = 0;
    for (const q of questions) {
      if (dto.answers[q.id] === q.correct) correct += 1;
    }
    const score = questions.length > 0 ? (correct / questions.length) * 100 : 0;
    const passed = score >= quiz.passingScore;

    await this.prisma.trainingQuizAttempt.create({
      data: {
        quizId: quiz.id,
        assignmentId,
        employeeId: assignment.employeeId,
        score,
        passed,
        answersJson: dto.answers as Prisma.InputJsonValue,
      },
    });

    if (passed) {
      await this.markCompleted(actor, assignmentId, score);
    }

    await this.audit.record(actor, {
      entityType: 'TrainingQuizAttempt',
      entityId: assignmentId,
      action: passed ? 'quiz_passed' : 'quiz_failed',
      after: { score, passed },
    });

    return { score, passed, passingScore: quiz.passingScore };
  }

  private async markCompleted(actor: ActorContext, assignmentId: string, score?: number) {
    const updated = await this.prisma.trainingAssignment.update({
      where: { id: assignmentId },
      data: {
        status: 'completed',
        completedAt: this.dates.now(),
        score: score ?? undefined,
        updatedBy: actor.userId,
      },
    });
    await this.audit.record(actor, {
      entityType: 'TrainingAssignment',
      entityId: assignmentId,
      action: 'completed',
    });
    return updated;
  }
}
