import {
  Body, Controller, Get, Param, Patch, Post, Query,
} from '@nestjs/common';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { AnnouncementService } from '../../application/announcement.service';
import {
  CreateAnnouncementDto,
  ListAnnouncementsQuery,
  UpdateAnnouncementDto,
} from '../../application/dto/announcement.dto';

@Controller('announcements')
export class AnnouncementController {
  constructor(private readonly service: AnnouncementService) {}

  @Get()
  @RequirePermission('document:read')
  list(@CurrentActor() actor: ActorContext, @Query() query: ListAnnouncementsQuery) {
    return this.service.list(actor, query);
  }

  @Get('my')
  @RequirePermission('document:read')
  listMy(@CurrentActor() actor: ActorContext) {
    return this.service.listForEmployee(actor);
  }

  @Get('dashboard')
  @RequirePermission('document:read')
  dashboard(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
  ) {
    return this.service.getDashboard(actor, companyId);
  }

  @Get(':id/delivery-status')
  @RequirePermission('document:read')
  deliveryStatus(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
  ) {
    return this.service.getDeliveryStatus(actor, id);
  }

  @Post(':id/remind-unacknowledged')
  @RequirePermission('document:write')
  remindUnacknowledged(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
  ) {
    return this.service.remindUnacknowledged(actor, id);
  }

  @Get(':id')
  @RequirePermission('document:read')
  get(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.get(actor, id);
  }

  @Post()
  @RequirePermission('document:write')
  create(@CurrentActor() actor: ActorContext, @Body() dto: CreateAnnouncementDto) {
    return this.service.create(actor, dto);
  }

  @Patch(':id')
  @RequirePermission('document:write')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: UpdateAnnouncementDto,
  ) {
    return this.service.update(actor, id, dto);
  }

  @Post(':id/publish')
  @RequirePermission('document:write')
  publish(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.publish(actor, id);
  }

  @Post(':id/archive')
  @RequirePermission('document:write')
  archive(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.archive(actor, id);
  }

  @Post('deliveries/:id/open')
  @RequirePermission('document:read')
  markOpened(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.markOpened(actor, id);
  }

  @Post('deliveries/:id/acknowledge')
  @RequirePermission('document:read')
  markAcknowledged(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.markAcknowledged(actor, id);
  }
}
