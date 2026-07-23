import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { DocumentRequestService } from '../../application/document-request.service';
import { CreateDocumentRequestDto } from '../../application/dto/document-request.dto';

@Controller('document-requests')
export class DocumentRequestController {
  constructor(private readonly service: DocumentRequestService) {}

  @Get('types')
  @RequirePermission('document:read')
  listTypes() {
    return this.service.listTypes();
  }

  @Get('mine')
  @RequirePermission('document:read')
  listMine(@CurrentActor() actor: ActorContext) {
    return this.service.listMine(actor);
  }

  @Get(':id')
  @RequirePermission('document:read')
  get(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.get(actor, id);
  }

  @Post('employees/:employeeId')
  @RequirePermission('document:write')
  submit(
    @CurrentActor() actor: ActorContext,
    @Param('employeeId') employeeId: string,
    @Body() dto: CreateDocumentRequestDto,
  ) {
    return this.service.submit(actor, employeeId, dto);
  }
}
