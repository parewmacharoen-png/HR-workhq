import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { DateProvider } from '../../../shared/time/date.provider';
import {
  BUSINESS_PERMISSION_REPOSITORY,
  BusinessPermissionRepository,
} from '../../permission/domain/repositories/business-permission.repository';
import { AnnouncementReminderNotifier } from './announcement-reminder.notifier';
import {
  CreateAnnouncementDto,
  ListAnnouncementsQuery,
  UpdateAnnouncementDto,
} from './dto/announcement.dto';

@Injectable()
export class AnnouncementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly companyAccess: CompanyAccessService,
    private readonly dates: DateProvider,
    private readonly reminderNotifier: AnnouncementReminderNotifier,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly permissions: BusinessPermissionRepository,
  ) {}

  async create(actor: ActorContext, dto: CreateAnnouncementDto) {
    if (dto.companyId) await this.companyAccess.assertCompanyAccess(actor, dto.companyId);
    const announcement = await this.prisma.announcement.create({
      data: {
        companyId: dto.companyId ?? null,
        teamId: dto.teamId ?? null,
        title: dto.title,
        body: dto.body ?? null,
        announcementType: dto.announcementType ?? 'general',
        mustAcknowledge: dto.mustAcknowledge ?? false,
        status: 'draft',
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
    });
    await this.audit.record(actor, {
      entityType: 'Announcement',
      entityId: announcement.id,
      action: 'create',
      after: announcement,
    });
    return announcement;
  }

  async list(actor: ActorContext, query: ListAnnouncementsQuery) {
    if (query.companyId) await this.companyAccess.assertCompanyAccess(actor, query.companyId);
    return this.prisma.announcement.findMany({
      where: {
        deletedAt: null,
        ...(query.companyId ? { companyId: query.companyId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async listForEmployee(actor: ActorContext) {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (!access?.employeeId) return [];
    const deliveries = await this.prisma.announcementDelivery.findMany({
      where: { employeeId: access.employeeId },
      include: { announcement: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return deliveries
      .filter((d) => d.announcement.deletedAt == null && d.announcement.status === 'published')
      .map((d) => ({
        ...d.announcement,
        delivery: {
          id: d.id,
          deliveredAt: d.deliveredAt,
          openedAt: d.openedAt,
          readAt: d.readAt,
          acknowledgedAt: d.acknowledgedAt,
        },
      }));
  }

  async get(actor: ActorContext, id: string) {
    const announcement = await this.prisma.announcement.findFirst({
      where: { id, deletedAt: null },
      include: { deliveries: true },
    });
    if (!announcement) throw new Error('Announcement not found');
    if (announcement.companyId) {
      await this.companyAccess.assertCompanyAccess(actor, announcement.companyId);
    }
    return announcement;
  }

  async update(actor: ActorContext, id: string, dto: UpdateAnnouncementDto) {
    const existing = await this.get(actor, id);
    if (existing.status !== 'draft') throw new Error('Only draft announcements can be edited');
    const updated = await this.prisma.announcement.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.announcementType !== undefined ? { announcementType: dto.announcementType } : {}),
        ...(dto.mustAcknowledge !== undefined ? { mustAcknowledge: dto.mustAcknowledge } : {}),
        updatedBy: actor.userId,
      },
    });
    await this.audit.record(actor, {
      entityType: 'Announcement',
      entityId: id,
      action: 'edited',
      after: updated,
    });
    return updated;
  }

  async publish(actor: ActorContext, id: string) {
    const announcement = await this.get(actor, id);
    const now = this.dates.now();
    const updated = await this.prisma.announcement.update({
      where: { id },
      data: { status: 'published', publishedAt: now, updatedBy: actor.userId },
    });
    await this.deliverToEmployees(id, announcement.companyId, announcement.teamId);
    await this.audit.record(actor, {
      entityType: 'Announcement',
      entityId: id,
      action: 'published',
    });
    return updated;
  }

  async archive(actor: ActorContext, id: string) {
    await this.get(actor, id);
    const updated = await this.prisma.announcement.update({
      where: { id },
      data: { status: 'archived', archivedAt: this.dates.now(), updatedBy: actor.userId },
    });
    await this.audit.record(actor, {
      entityType: 'Announcement',
      entityId: id,
      action: 'archived',
    });
    return updated;
  }

  async deliverToEmployees(
    announcementId: string,
    companyId: string | null,
    teamId: string | null,
  ): Promise<number> {
    const employees = await this.prisma.employee.findMany({
      where: {
        deletedAt: null,
        employmentStatus: { not: 'terminated' },
        assignments: {
          some: {
            ...(companyId ? { companyId } : {}),
            ...(teamId ? { teamId } : {}),
            effectiveTo: null,
            deletedAt: null,
          },
        },
      },
      select: { id: true },
    });

    const now = this.dates.now();
    let created = 0;
    for (const emp of employees) {
      await this.prisma.announcementDelivery.upsert({
        where: {
          announcementId_employeeId: { announcementId, employeeId: emp.id },
        },
        create: {
          announcementId,
          employeeId: emp.id,
          deliveredAt: now,
        },
        update: { deliveredAt: now },
      });
      created++;
    }
    return created;
  }

  async markOpened(actor: ActorContext, deliveryId: string) {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (!access?.employeeId) throw new Error('Employee profile required');
    const delivery = await this.prisma.announcementDelivery.findFirst({
      where: { id: deliveryId, employeeId: access.employeeId },
    });
    if (!delivery) throw new Error('Delivery not found');
    const now = this.dates.now();
    const updated = await this.prisma.announcementDelivery.update({
      where: { id: deliveryId },
      data: {
        openedAt: delivery.openedAt ?? now,
        readAt: now,
        updatedBy: actor.userId,
      },
    });
    await this.audit.record(actor, {
      entityType: 'AnnouncementDelivery',
      entityId: deliveryId,
      action: 'opened',
      after: { announcementId: delivery.announcementId },
    });
    return updated;
  }

  async markAcknowledged(actor: ActorContext, deliveryId: string, fromReminder = false) {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (!access?.employeeId) throw new Error('Employee profile required');
    const delivery = await this.prisma.announcementDelivery.findFirst({
      where: { id: deliveryId, employeeId: access.employeeId },
    });
    if (!delivery) throw new Error('Delivery not found');
    const now = this.dates.now();
    const updated = await this.prisma.announcementDelivery.update({
      where: { id: deliveryId },
      data: {
        acknowledgedAt: now,
        openedAt: delivery.openedAt ?? now,
        readAt: delivery.readAt ?? now,
        acknowledgedFromReminder: fromReminder || delivery.acknowledgedFromReminder,
        updatedBy: actor.userId,
      },
    });
    await this.audit.record(actor, {
      entityType: 'AnnouncementDelivery',
      entityId: deliveryId,
      action: fromReminder ? 'announcement_acknowledged_from_reminder' : 'acknowledged',
      after: { announcementId: delivery.announcementId },
    });
    return updated;
  }

  async getDashboard(actor: ActorContext, companyId: string) {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const publishedWhere = { companyId, deletedAt: null, status: 'published' as const };
    const [published, draft, deliveries] = await Promise.all([
      this.prisma.announcement.count({ where: publishedWhere }),
      this.prisma.announcement.count({
        where: { companyId, deletedAt: null, status: 'draft' },
      }),
      this.prisma.announcementDelivery.findMany({
        where: { announcement: publishedWhere },
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          announcement: { select: { mustAcknowledge: true } },
        },
      }),
    ]);

    const unopened = deliveries.filter((d) => !d.openedAt).length;
    const unacknowledged = deliveries.filter((d) => !d.acknowledgedAt).length;
    const mustAckDeliveries = deliveries.filter((d) => d.announcement.mustAcknowledge);
    const ackRate = mustAckDeliveries.length
      ? Math.round(
        (mustAckDeliveries.filter((d) => d.acknowledgedAt).length / mustAckDeliveries.length) * 100,
      )
      : 100;

    const overdueEmployees = deliveries
      .filter((d) => d.announcement.mustAcknowledge && !d.acknowledgedAt && d.ackReminderSentAt)
      .map((d) => ({
        employeeId: d.employeeId,
        employeeName: `${d.employee.firstName} ${d.employee.lastName}`,
        deliveryId: d.id,
        announcementId: d.announcementId,
      }));

    return {
      published,
      draft,
      unopened,
      unacknowledged,
      acknowledgementRate: ackRate,
      overdueAcknowledgements: overdueEmployees,
    };
  }

  async getDeliveryStatus(actor: ActorContext, announcementId: string) {
    const announcement = await this.get(actor, announcementId);
    const deliveries = await this.prisma.announcementDelivery.findMany({
      where: { announcementId },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return {
      announcementId,
      title: announcement.title,
      mustAcknowledge: announcement.mustAcknowledge,
      total: deliveries.length,
      opened: deliveries.filter((d) => d.openedAt).length,
      acknowledged: deliveries.filter((d) => d.acknowledgedAt).length,
      deliveries: deliveries.map((d) => ({
        id: d.id,
        employeeId: d.employeeId,
        employeeName: `${d.employee.firstName} ${d.employee.lastName}`,
        deliveredAt: d.deliveredAt,
        openedAt: d.openedAt,
        acknowledgedAt: d.acknowledgedAt,
        openedReminderSentAt: d.openedReminderSentAt,
        ackReminderSentAt: d.ackReminderSentAt,
      })),
    };
  }

  async remindUnacknowledged(actor: ActorContext, announcementId: string) {
    const announcement = await this.get(actor, announcementId);
    const now = this.dates.now();
    const pending = await this.prisma.announcementDelivery.findMany({
      where: {
        announcementId,
        acknowledgedAt: null,
        announcement: { mustAcknowledge: true, status: 'published' },
      },
    });

    for (const d of pending) {
      await this.reminderNotifier.sendUnacknowledgedReminder(d.id);
      await this.prisma.announcementDelivery.update({
        where: { id: d.id },
        data: { ackReminderSentAt: now },
      });
      await this.audit.record(actor, {
        entityType: 'AnnouncementDelivery',
        entityId: d.id,
        action: 'announcement_reminder_sent',
        after: { kind: 'manual_unacknowledged', announcementId },
      });
    }

    return { reminded: pending.length, title: announcement.title };
  }
}
